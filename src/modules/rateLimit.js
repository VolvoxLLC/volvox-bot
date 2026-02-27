/**
 * Rate Limiting Module
 * Tracks messages per user per channel with a sliding window.
 * Actions on trigger: delete excess messages, warn user, temp-mute on repeat.
 */

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { info, warn } from '../logger.js';
import { isExempt } from '../utils/modExempt.js';
import { safeReply, safeSend } from '../utils/safeSend.js';
import { sanitizeMentions } from '../utils/sanitizeMentions.js';

/** Maximum number of (userId:channelId) entries to track simultaneously. */
let _maxTrackedUsers = 10_000;

/**
 * Override the memory cap. **For tests only.**
 * Call clearRateLimitState() after to reset tracking.
 * @param {number} n
 */
export function setMaxTrackedUsers(n) {
  _maxTrackedUsers = n;
}

/**
 * Per-user-per-channel sliding window state.
 * Key: `${userId}:${channelId}`
 * Value: {
 *   timestamps: number[],
 *   triggerCount: number,
 *   triggerWindowStart: number,
 *   windowMs: number,
 *   muteWindowMs: number,
 * }
 * @type {Map<string, {
 *   timestamps: number[],
 *   triggerCount: number,
 *   triggerWindowStart: number,
 *   windowMs: number,
 *   muteWindowMs: number,
 * }>}
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
 * Send a temp-mute (timeout) to a repeat offender and alert the mod channel.
 * @param {import('discord.js').Message} message
 * @param {Object} config
 * @param {number} muteDurationMs
 */
async function handleRepeatOffender(message, config, muteDurationMs) {
  const member = message.member;
  if (!member) return;

  const rlConfig = config.moderation?.rateLimit ?? {};
  const muteThreshold = rlConfig.muteAfterTriggers ?? 3;
  const muteWindowSeconds = rlConfig.muteWindowSeconds ?? 300;

  // Apply timeout — use PermissionFlagsBits constant, not a string
  if (!member.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
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

  const muteWindowMinutes = Math.round(muteWindowSeconds / 60);
  const reasonText =
    `Repeated rate limit violations ` +
    `(${muteThreshold} triggers in ${muteWindowMinutes} minute${muteWindowMinutes === 1 ? '' : 's'})`;

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⏱️ Rate Limit: Temp-Mute Applied')
    .addFields(
      {
        name: 'User',
        value: `<@${message.author.id}> (${sanitizeMentions(message.author.tag)})`,
        inline: true,
      },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Duration', value: `${Math.round(muteDurationMs / 60000)} minute(s)`, inline: true },
      { name: 'Reason', value: reasonText },
    )
    .setTimestamp();

  await safeSend(alertChannel, { embeds: [embed] }).catch(() => {});
}

/**
 * Send a rate-limit warning to the offending user in-channel.
 * Uses safeReply to enforce allowedMentions and sanitization.
 * @param {import('discord.js').Message} message
 * @param {number} maxMessages
 * @param {number} windowSeconds
 */
async function warnUser(message, maxMessages, windowSeconds) {
  const reply = await safeReply(
    message,
    `⚠️ <@${message.author.id}>, you're sending messages too fast! ` +
      `Limit: ${maxMessages} messages per ${windowSeconds} seconds.`,
  ).catch(() => null);

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
  const muteWindowMs = muteWindowSeconds * 1000;
  const muteDurationMs = (rlConfig.muteDurationSeconds ?? 300) * 1000; // 5 minutes

  const key = `${message.author.id}:${message.channel.id}`;
  const now = Date.now();

  // Cap tracked users to avoid memory blowout
  if (!windowMap.has(key) && windowMap.size >= _maxTrackedUsers) {
    evictOldest(Math.ceil(_maxTrackedUsers * 0.1)); // evict 10%
  }

  let entry = windowMap.get(key);
  if (!entry) {
    entry = {
      timestamps: [],
      triggerCount: 0,
      triggerWindowStart: now,
      windowMs,
      muteWindowMs,
    };
    windowMap.set(key, entry);
  }

  // Keep the most recently-seen retention windows for cleanup safety.
  entry.windowMs = windowMs;
  entry.muteWindowMs = muteWindowMs;

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

/** @type {ReturnType<typeof setInterval> | null} */
let cleanupInterval = null;

/**
 * Start periodic cleanup of stale windowMap entries.
 * Removes entries when the latest activity is older than the tracked retention window.
 * Runs every 5 minutes.
 */
function startRateLimitCleanup() {
  if (cleanupInterval) return;
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const DEFAULT_WINDOW_MS = 10 * 1000; // fallback window

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windowMap) {
      const newestTimestamp =
        entry.timestamps.length > 0 ? entry.timestamps[entry.timestamps.length - 1] : 0;
      const newestActivity = Math.max(newestTimestamp, entry.triggerWindowStart ?? 0);
      const retentionMs = Math.max(
        entry.windowMs ?? DEFAULT_WINDOW_MS,
        entry.muteWindowMs ?? DEFAULT_WINDOW_MS,
      );

      if (now - newestActivity > retentionMs) {
        windowMap.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();
}

// Auto-start cleanup when module loads
startRateLimitCleanup();

/**
 * Stop the periodic windowMap cleanup interval.
 * Call during graceful shutdown.
 */
export function stopRateLimitCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clear all rate limit state. Primarily for testing.
 */
export function clearRateLimitState() {
  windowMap.clear();
  _maxTrackedUsers = 10_000;
}

/**
 * Return current tracked user count. For monitoring/tests.
 * @returns {number}
 */
export function getTrackedCount() {
  return windowMap.size;
}
