/**
 * Rate Limiting Module
 * Tracks messages per user per channel with a sliding window.
 * Actions on trigger: delete excess messages, warn user, temp-mute on repeat.
 */

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { info, warn } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';

/** Maximum number of (userId:channelId) entries to track simultaneously. */
const MAX_TRACKED_USERS = 10_000;

/**
 * Per-user-per-channel sliding window state.
 * Key: `${userId}:${channelId}`
 * Value: { timestamps: number[], triggerCount: number, triggerWindowStart: number }
 * @type {Map<string, { timestamps: number[], triggerCount: number, triggerWindowStart: number }>}
 */
const windowMap = new Map();

/**
 * Evict the oldest `count` entries when the cap is reached.
 * @param {number} count
 */
function evictOldest(count = 1) {
  const iter = windowMap.keys();
  for (let i = 0; i < count; i++) {
    const next = iter.next();
    if (next.done) break;
    windowMap.delete(next.value);
  }
}

/**
 * Check whether a message author has mod/admin permissions.
 * Exempt if they hold any role listed in `permissions.modRoles`, or if they
 * have ADMINISTRATOR permission.
 * @param {import('discord.js').Message} message
 * @param {Object} config
 * @returns {boolean}
 */
function isExempt(message, config) {
  const member = message.member;
  if (!member) return false;

  // ADMINISTRATOR permission bypasses everything
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const modRoles = config.permissions?.modRoles ?? [];
  if (modRoles.length === 0) return false;

  return member.roles.cache.some(
    (role) => modRoles.includes(role.id) || modRoles.includes(role.name),
  );
}

/**
 * Send a temp-mute (timeout) to a repeat offender and alert the mod channel.
 * @param {import('discord.js').Message} message
 * @param {Object} config
 * @param {number} muteDurationMs
 */
async function handleRepeatOffender(message, config, muteDurationMs) {
  const member = message.member;
  if (!member) return;

  // Apply timeout
  if (!member.guild.members.me?.permissions.has('ModerateMembers')) {
    warn('Rate limit: bot lacks MODERATE_MEMBERS permission', { guildId: message.guild.id });
    return;
  }
  try {
    await member.timeout(muteDurationMs, 'Rate limit: repeated violations');
    info('Rate limit temp-mute applied', {
      userId: message.author.id,
      guildId: message.guild.id,
      durationMs: muteDurationMs,
    });
  } catch (err) {
    warn('Rate limit: failed to apply timeout', { userId: message.author.id, error: err.message });
  }

  // Alert mod channel
  const alertChannelId = config.moderation?.alertChannelId;
  if (!alertChannelId) return;

  const alertChannel = await message.client.channels.fetch(alertChannelId).catch(() => null);
  if (!alertChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⏱️ Rate Limit: Temp-Mute Applied')
    .addFields(
      { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Duration', value: `${Math.round(muteDurationMs / 60000)} minute(s)`, inline: true },
      { name: 'Reason', value: 'Repeated rate limit violations (3 triggers in 5 minutes)' },
    )
    .setTimestamp();

  await safeSend(alertChannel, { embeds: [embed] }).catch(() => {});
}

/**
 * Send a rate-limit warning to the offending user in-channel.
 * @param {import('discord.js').Message} message
 * @param {number} maxMessages
 * @param {number} windowSeconds
 */
async function warnUser(message, maxMessages, windowSeconds) {
  const reply = await message
    .reply(
      `⚠️ <@${message.author.id}>, you're sending messages too fast! ` +
        `Limit: ${maxMessages} messages per ${windowSeconds} seconds.`,
    )
    .catch(() => null);

  // Auto-delete the warning after 10 seconds
  if (reply) {
    setTimeout(() => reply.delete().catch(() => {}), 10_000);
  }
}

/**
 * Check whether a message triggers the rate limit.
 * Side effects on trigger: deletes excess message, warns user, may temp-mute.
 *
 * @param {import('discord.js').Message} message - Discord message object
 * @param {Object} config - Bot config (merged guild config)
 * @returns {Promise<{ limited: boolean, reason?: string }>}
 */
export async function checkRateLimit(message, config) {
  const rlConfig = config.moderation?.rateLimit ?? {};

  if (!rlConfig.enabled) return { limited: false };
  if (isExempt(message, config)) return { limited: false };

  const maxMessages = rlConfig.maxMessages ?? 10;
  const windowSeconds = rlConfig.windowSeconds ?? 10;
  const windowMs = windowSeconds * 1000;

  // Temp-mute config
  const muteThreshold = rlConfig.muteAfterTriggers ?? 3;
  const muteWindowSeconds = rlConfig.muteWindowSeconds ?? 300; // 5 minutes
  const muteDurationMs = (rlConfig.muteDurationSeconds ?? 300) * 1000; // 5 minutes

  const key = `${message.author.id}:${message.channel.id}`;
  const now = Date.now();

  // Cap tracked users to avoid memory blowout
  if (!windowMap.has(key) && windowMap.size >= MAX_TRACKED_USERS) {
    evictOldest(Math.ceil(MAX_TRACKED_USERS * 0.1)); // evict 10%
  }

  let entry = windowMap.get(key);
  if (!entry) {
    entry = { timestamps: [], triggerCount: 0, triggerWindowStart: now };
    windowMap.set(key, entry);
  }

  // Slide the window: drop timestamps older than windowMs
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);
  entry.timestamps.push(now);

  if (entry.timestamps.length <= maxMessages) {
    return { limited: false };
  }

  // --- Rate limited ---
  const reason = `Exceeded ${maxMessages} messages in ${windowSeconds}s`;
  warn('Rate limit triggered', {
    userId: message.author.id,
    channelId: message.channel.id,
    count: entry.timestamps.length,
    max: maxMessages,
  });

  // Delete the excess message
  await message.delete().catch(() => {});

  // Track trigger count for mute escalation (sliding 5-min window)
  const muteWindowMs = muteWindowSeconds * 1000;
  if (now - entry.triggerWindowStart > muteWindowMs) {
    // Reset trigger window
    entry.triggerCount = 1;
    entry.triggerWindowStart = now;
  } else {
    entry.triggerCount += 1;
  }

  if (entry.triggerCount >= muteThreshold) {
    // Reset counter so they don't get re-muted every single message
    entry.triggerCount = 0;
    entry.triggerWindowStart = now;

    await handleRepeatOffender(message, config, muteDurationMs);
    return { limited: true, reason: `${reason} (temp-muted: repeat offender)` };
  }

  // Warn the user on first trigger
  if (entry.triggerCount === 1) {
    await warnUser(message, maxMessages, windowSeconds);
  }

  return { limited: true, reason };
}

/**
 * Clear all rate limit state. Primarily for testing.
 */
export function clearRateLimitState() {
  windowMap.clear();
}

/**
 * Return current tracked user count. For monitoring/tests.
 * @returns {number}
 */
export function getTrackedCount() {
  return windowMap.size;
}
