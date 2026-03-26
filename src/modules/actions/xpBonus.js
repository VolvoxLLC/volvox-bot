/**
 * xpBonus Action Handler
 * Awards extra XP as a level-up reward.
 * Includes recursion guard to prevent infinite level-up loops.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/369
 */

import { getPool } from '../../db.js';
import { info, warn } from '../../logger.js';

/**
 * Tracks guilds+users currently inside an xpBonus handler to prevent
 * recursive level-ups from triggering infinite loops.
 * @type {Set<string>}
 */
const activeXpBonusGrants = new Set();

/**
 * Check whether an xpBonus grant is already in progress for this member.
 * Exported for testability.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
export function isXpBonusActive(guildId, userId) {
  return activeXpBonusGrants.has(`${guildId}:${userId}`);
}

/**
 * Award bonus XP to the member. Writes directly to the DB.
 * Does NOT trigger a new level-up check — the recursion guard prevents
 * infinite loops by skipping if we're already inside an xpBonus grant.
 *
 * @param {Object} action - { type: "xpBonus", amount: number }
 * @param {Object} context - Pipeline context
 */
export async function handleXpBonus(action, context) {
  const { member, guild } = context;
  const userId = member.user?.id;
  const guildId = guild.id;
  const amount = Number(action.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    warn('xpBonus action has invalid amount — skipping', {
      guildId,
      userId,
      amount: action.amount,
    });
    return;
  }

  // Recursion guard: if we're already granting XP for this user, skip
  const key = `${guildId}:${userId}`;
  if (activeXpBonusGrants.has(key)) {
    warn('xpBonus recursion detected — skipping to prevent infinite loop', {
      guildId,
      userId,
      amount,
    });
    return;
  }

  activeXpBonusGrants.add(key);
  try {
    const pool = getPool();
    await pool.query(
      'UPDATE reputation SET xp = xp + $1 WHERE guild_id = $2 AND user_id = $3',
      [amount, guildId, userId],
    );

    info('xpBonus granted', { guildId, userId, amount });
  } finally {
    activeXpBonusGrants.delete(key);
  }
}
