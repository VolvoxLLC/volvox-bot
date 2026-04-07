/**
 * sendDm Action Handler
 * Sends a DM to the member who leveled up with a rendered template.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/368
 */

import { debug, info, warn } from '../../logger.js';
import { safeSend } from '../../utils/safeSend.js';
import { buildPayload } from './buildPayload.js';

/**
 * Rate limit: 1 DM per user per 60 seconds.
 *
 * NOTE: This rate limiter is process-local (in-memory Map). It resets on
 * every bot restart and shard deploy. It is intended only as a best-effort
 * guard against rapid duplicate DMs — not a distributed or persistent limit.
 */
const DM_RATE_WINDOW_MS = 60_000;

/**
 * In-memory DM rate limiter: `${guildId}:${userId}` → last DM timestamp.
 * @type {Map<string, number>}
 */
const dmLimits = new Map();

function getDmLimitKey(guildId, userId, scope = 'default') {
  return `${guildId}:${userId}:${scope}`;
}

/**
 * Check whether a DM is allowed under the rate limit.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
export function checkDmRateLimit(guildId, userId, scope = 'default') {
  const key = getDmLimitKey(guildId, userId, scope);
  const lastSent = dmLimits.get(key);
  if (lastSent && Date.now() - lastSent < DM_RATE_WINDOW_MS) {
    return false;
  }
  return true;
}

/**
 * Record a successful DM send for rate limiting.
 *
 * @param {string} guildId
 * @param {string} userId
 */
export function recordDmSend(guildId, userId, scope = 'default') {
  dmLimits.set(getDmLimitKey(guildId, userId, scope), Date.now());
}

/**
 * Evict stale DM rate limit entries. Call periodically to prevent memory leaks.
 * Exported for testability.
 */
export function sweepDmLimits() {
  const now = Date.now();
  for (const [key, ts] of dmLimits) {
    if (now - ts >= DM_RATE_WINDOW_MS) {
      dmLimits.delete(key);
    }
  }
}

/**
 * Clear all DM rate limit entries. Used in tests only.
 */
export function resetDmLimits() {
  dmLimits.clear();
}

/**
 * Send a DM to the member who leveled up.
 * Uses safeSend to handle messages >2000 chars (splits automatically) and
 * sanitizes mentions. Fails silently when the user has DMs disabled.
 *
 * @param {Object} action - { type: "sendDm", format, template, embed }
 * @param {Object} context - Pipeline context
 */
export async function handleSendDm(action, context) {
  const { member, guild, templateContext } = context;
  const userId = member.user?.id;
  const rateLimitScope = action.rateLimitScope ?? 'default';

  if (!checkDmRateLimit(guild.id, userId, rateLimitScope)) {
    debug('DM rate-limited — skipping', { guildId: guild.id, userId });
    return;
  }

  const payload = buildPayload(action, templateContext);

  try {
    await safeSend(member.user, payload);
    recordDmSend(guild.id, userId, rateLimitScope);
    info('Level-up DM sent', { guildId: guild.id, userId });
  } catch (err) {
    // 50007 = Cannot send messages to this user (DMs disabled)
    if (err.code === 50007) {
      debug('User has DMs disabled — skipping', { guildId: guild.id, userId });
      return;
    }
    warn('Failed to send level-up DM', {
      guildId: guild.id,
      userId,
      error: err.message,
    });
  }
}

// Periodic sweep to prevent memory leaks
setInterval(sweepDmLimits, 5 * 60 * 1000).unref();
