/**
 * Per-guild AI spend tracking and enforcement utilities.
 *
 * Queries the `ai_usage` table to compute cumulative spend for a guild within a
 * configurable time window (default: 24 hours).  Used by the triage module to
 * gate evaluations when a guild exceeds its daily AI budget.
 */

import { getPool } from '../db.js';
import { warn } from '../logger.js';

/**
 * Query cumulative AI spend for a guild within a rolling time window.
 *
 * Returns 0 when the database pool is unavailable, when guildId is falsy, or
 * when no rows match.
 *
 * @param {string} guildId - Discord guild ID.
 * @param {number} [windowMs=86400000] - Rolling window in milliseconds (default: 24 h).
 * @returns {Promise<number>} Total spend in USD for the window period.
 */
export async function getGuildSpend(guildId, windowMs = 24 * 60 * 60 * 1000) {
  if (!guildId) return 0;

  let pool;
  try {
    pool = getPool();
  } catch {
    return 0;
  }

  try {
    const since = new Date(Date.now() - windowMs);
    const { rows } = await pool.query(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE guild_id = $1 AND created_at >= $2',
      [guildId, since],
    );
    return parseFloat(rows[0]?.total ?? 0);
  } catch (err) {
    warn('getGuildSpend query failed', { guildId, error: err?.message });
    return 0;
  }
}

/**
 * Check whether a guild has exceeded (or is approaching) its configured daily AI budget.
 *
 * Returns a structured result so callers can decide how to act:
 * - 'exceeded'  — spend >= dailyBudgetUsd (block evaluation)
 * - 'warning'   — spend >= 80% of dailyBudgetUsd (log a warning, continue)
 * - 'ok'        — under 80% (no action needed)
 *
 * @param {string} guildId - Discord guild ID.
 * @param {number} dailyBudgetUsd - Configured budget cap in USD.
 * @param {number} [windowMs=86400000] - Rolling window in milliseconds (default: 24 h).
 * @returns {Promise<{status: 'ok'|'warning'|'exceeded', spend: number, budget: number, pct: number}>}
 */
export async function checkGuildBudget(guildId, dailyBudgetUsd, windowMs = 24 * 60 * 60 * 1000) {
  const spend = await getGuildSpend(guildId, windowMs);
  const pct = dailyBudgetUsd > 0 ? spend / dailyBudgetUsd : 0;

  let status;
  if (pct >= 1) {
    status = 'exceeded';
  } else if (pct >= 0.8) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return { status, spend, budget: dailyBudgetUsd, pct };
}
