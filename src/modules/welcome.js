/**
 * Welcome Module
 * Handles dynamic welcome messages for new members
 */

import { info, error as logError } from '../logger.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { safeSend } from '../utils/safeSend.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { computeDynamicContext, getActivityWindowMs } from './welcomeDynamicContext.js';
import { isReturningMember } from './welcomeOnboarding.js';

const guildActivity = new Map();
const MAX_EVENTS_PER_CHANNEL = 250;
const EVICTION_INTERVAL = 50;

/** Counter for throttled eviction inside recordCommunityActivity */
let activityCallCount = 0;

/** @type {{key: string, set: Set<string>} | null} Cached excluded channels Set */
let excludedChannelsCache = null;

/**
 * Test-only helper: snapshot guild activity state.
 * @param {string} guildId - Guild ID
 * @returns {Record<string, number[]>}
 */
export function __getCommunityActivityState(guildId) {
  const activityMap = guildActivity.get(guildId);
  if (!activityMap) return {};

  return Object.fromEntries(
    [...activityMap.entries()].map(([channelId, timestamps]) => [channelId, [...timestamps]]),
  );
}

/**
 * Test-only helper: clear in-memory activity state.
 */
export function __resetCommunityActivityState() {
  guildActivity.clear();
  activityCallCount = 0;
  excludedChannelsCache = null;
}

/**
 * Render welcome message with placeholder replacements.
 *
 * Static variables (always available):
 *   {{user}}          – Discord mention (<@id>)
 *   {{username}}      – Plain username
 *   {{server}}        – Guild name
 *   {{memberCount}}   – Current member count
 *
 * Dynamic variables (available when dynamic welcome is enabled):
 *   {{greeting}}      – Time-of-day greeting line
 *   {{vibeLine}}      – Community activity description
 *   {{ctaLine}}       – Suggested channels call-to-action
 *   {{milestoneLine}} – Member milestone or "rolled in as member #N"
 *   {{timeOfDay}}     – morning, afternoon, evening, or night
 *   {{activityLevel}} – quiet, light, steady, busy, or hype
 *   {{topChannels}}   – Most active channel mentions
 *
 * @param {string} messageTemplate - Welcome message template
 * @param {Object} member - Member object with id and optional username
 * @param {Object} guild - Guild object with name and memberCount
 * @param {Object} [dynamicContext] - Dynamic context from computeDynamicContext
 * @returns {string} Rendered welcome message
 */
export function renderWelcomeMessage(messageTemplate, member, guild, dynamicContext) {
  return renderTemplate(messageTemplate, {
    ...(dynamicContext ?? {}),
    user: `<@${member.id}>`,
    username: member.username || 'Unknown',
    server: guild.name ?? '',
    memberCount: (guild.memberCount ?? 0).toString(),
  });
}

/**
 * Pick a random variant from an array of message templates.
 * Falls back to the single `message` field when no variants are configured.
 *
 * @param {string[]} variants - Array of message template strings
 * @param {string} fallback - Fallback single message template
 * @returns {string} Selected template
 */
export function pickWelcomeVariant(variants, fallback) {
  if (Array.isArray(variants) && variants.length > 0) {
    const idx = Math.floor(Math.random() * variants.length);
    return variants[idx];
  }
  return fallback || 'Welcome, {{user}}!';
}

/**
 * Track message activity for welcome context.
 * Called from messageCreate handler to build a live community pulse.
 * @param {Object} message - Discord message
 * @param {Object} config - Bot configuration
 */
export function recordCommunityActivity(message, config) {
  if (!message?.guild || !message?.channel || message.author?.bot) return;
  if (!message.channel?.isTextBased?.()) return;

  const welcomeDynamic = config?.welcome?.dynamic || {};
  const excludeList = welcomeDynamic.excludeChannels || [];
  const cacheKey = excludeList.join(',');
  if (!excludedChannelsCache || excludedChannelsCache.key !== cacheKey) {
    excludedChannelsCache = { key: cacheKey, set: new Set(excludeList) };
  }
  if (excludedChannelsCache.set.has(message.channel.id)) return;

  const now = Date.now();
  const windowMs = getActivityWindowMs(welcomeDynamic);
  const cutoff = now - windowMs;

  if (!guildActivity.has(message.guild.id)) {
    guildActivity.set(message.guild.id, new Map());
  }

  const activityMap = guildActivity.get(message.guild.id);
  const timestamps = activityMap.get(message.channel.id) || [];

  timestamps.push(now);
  while (timestamps.length && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  if (timestamps.length > MAX_EVENTS_PER_CHANNEL) {
    timestamps.splice(0, timestamps.length - MAX_EVENTS_PER_CHANNEL);
  }

  activityMap.set(message.channel.id, timestamps);

  // Periodically prune stale channels to prevent unbounded memory growth
  activityCallCount += 1;
  if (activityCallCount >= EVICTION_INTERVAL) {
    activityCallCount = 0;
    pruneStaleActivity(cutoff);
  }
}

/**
 * Prune channels with only stale timestamps from all guilds.
 * @param {number} cutoff - Timestamp threshold; entries older than this are stale
 */
function pruneStaleActivity(cutoff) {
  for (const [guildId, activityMap] of guildActivity) {
    for (const [channelId, timestamps] of activityMap) {
      // If the newest timestamp is older than the cutoff, the entire array is stale
      if (!timestamps.length || timestamps[timestamps.length - 1] < cutoff) {
        activityMap.delete(channelId);
      }
    }
    if (activityMap.size === 0) {
      guildActivity.delete(guildId);
    }
  }
}

/**
 * Resolve which welcome message template to use for a given channel.
 *
 * Priority order:
 *   1. Per-channel config (`welcome.channels[].channelId` match)
 *   2. Global variants (`welcome.variants` array — random selection)
 *   3. Global single message (`welcome.message`)
 *   4. Hard-coded fallback
 *
 * @param {string} channelId - The target channel ID
 * @param {Object} welcomeConfig - `config.welcome` section
 * @returns {string} Resolved message template
 */
export function resolveWelcomeTemplate(channelId, welcomeConfig) {
  // 1. Per-channel override
  const perChannel = Array.isArray(welcomeConfig?.channels)
    ? welcomeConfig.channels.find((c) => c.channelId === channelId)
    : null;

  if (perChannel) {
    return pickWelcomeVariant(perChannel.variants, perChannel.message);
  }

  // 2. Global variants / 3. Global single message / 4. Fallback
  return pickWelcomeVariant(welcomeConfig?.variants, welcomeConfig?.message);
}

/**
 * Send welcome message to new member.
 *
 * Sends to the primary welcome channel AND any additional per-channel
 * welcome configs that have a `channelId` different from the primary.
 *
 * @param {Object} member - Discord guild member
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 */
export async function sendWelcomeMessage(member, client, config) {
  if (!config.welcome?.enabled || !config.welcome?.channelId) return;

  const memberCtx = { id: member.id, username: member.user.username };
  const guildCtx = { name: member.guild.name, memberCount: member.guild.memberCount };
  const useDynamic = config.welcome?.dynamic?.enabled === true;
  const returningMember = isReturningMember(member);

  const dynamicCtx = useDynamic ? computeDynamicContext(member, config, guildActivity) : null;

  /**
   * Build the final message string for a given channel.
   * @param {string} channelId
   * @returns {string}
   */
  const buildMessage = (channelId) => {
    if (returningMember && config.welcome?.returningMessageEnabled !== false) {
      const returningTemplate = config.welcome?.returningMessage;
      if (returningTemplate) {
        return renderWelcomeMessage(returningTemplate, memberCtx, guildCtx, dynamicCtx);
      }
      return renderWelcomeMessage(
        'Welcome back, {{user}}! Glad to see you again. Jump back in whenever you are ready.',
        memberCtx,
        guildCtx,
      );
    }

    const template = resolveWelcomeTemplate(channelId, config.welcome);
    return renderWelcomeMessage(template, memberCtx, guildCtx, dynamicCtx);
  };

  const guildId = member.guild.id;

  // --- Primary channel ---
  try {
    const channel = await fetchChannelCached(client, config.welcome.channelId, guildId);
    if (channel) {
      await safeSend(channel, buildMessage(config.welcome.channelId));
      info('Welcome message sent', {
        guildId: member.guild.id,
        channelId: config.welcome.channelId,
        user: member.user.tag,
      });
    }
  } catch (err) {
    logError('Welcome error (primary channel)', { error: err.message, stack: err.stack });
  }

  // --- Additional per-channel configs ---
  const extraChannels = Array.isArray(config.welcome?.channels)
    ? config.welcome.channels.filter((c) => c.channelId && c.channelId !== config.welcome.channelId)
    : [];

  for (const channelCfg of extraChannels) {
    try {
      const channel = await fetchChannelCached(client, channelCfg.channelId, guildId);
      if (channel) {
        const template = pickWelcomeVariant(channelCfg.variants, channelCfg.message);
        const msg = renderWelcomeMessage(template, memberCtx, guildCtx);
        await safeSend(channel, msg);
        info('Welcome message sent (per-channel)', {
          guildId: member.guild.id,
          channelId: channelCfg.channelId,
          user: member.user.tag,
        });
      }
    } catch (err) {
      logError('Welcome error (per-channel)', {
        channelId: channelCfg.channelId,
        error: err.message,
        stack: err.stack,
      });
    }
  }
}
