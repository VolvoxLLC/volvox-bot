/**
 * Command Usage Tracking
 *
 * Records slash-command invocations in the command_usage table for analytics.
 * Queries are indexed for efficient aggregation by guild, user, and command.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/122
 */

import { getPool } from '../db.js';
import { warn } from '../logger.js';

/**
 * Record a slash-command usage. Call asynchronously (fire-and-forget) so the
 * command response is not blocked. Failures are logged and not thrown.
 *
 * @param {Object} opts
 * @param {import('pg').Pool} [opts.pool] - Database pool (defaults to getPool())
 * @param {string} opts.guildId - Discord guild ID
 * @param {string} opts.userId - Discord user ID
 * @param {string} opts.commandName - Slash command name
 * @param {string} [opts.channelId] - Discord channel ID (optional)
 */
export async function trackCommandUsage(opts) {
  const pool = opts.pool ?? getPool();
  if (!pool) return;

  const { guildId, userId, commandName, channelId } = opts;
  if (!guildId || !userId || !commandName) return;

  try {
    await pool.query(
      `INSERT INTO command_usage (guild_id, user_id, command_name, channel_id)
       VALUES ($1, $2, $3, $4)`,
      [guildId, userId, commandName, channelId ?? null],
    );
  } catch (err) {
    warn('Failed to record command usage', {
      guildId,
      commandName,
      error: err.message,
    });
  }
}

/**
 * Fetch aggregated command usage for a guild in a date range for analytics.
 * Returns rows with command_name and uses, ordered by uses DESC.
 *
 * @param {Object} opts
 * @param {import('pg').Pool} opts.pool - Database pool
 * @param {string} opts.guildId - Guild ID
 * @param {string} opts.from - ISO date string (inclusive)
 * @param {string} opts.to - ISO date string (inclusive)
 * @param {string} [opts.channelId] - Optional channel filter
 * @param {number} [opts.limit=15] - Max number of commands to return
 * @returns {Promise<{ rows: Array<{ command_name: string, uses: number }>, available: boolean }>}
 */
export async function getAggregatedCommandUsage(opts) {
  const { pool, guildId, from, to, channelId, limit = 15 } = opts;
  const values = [guildId, from, to];
  let whereClause = 'guild_id = $1 AND used_at >= $2 AND used_at <= $3';
  if (channelId) {
    values.push(channelId);
    whereClause += ` AND channel_id = $${values.length}`;
  }
  values.push(limit);

  try {
    const result = await pool.query(
      `SELECT
         COALESCE(NULLIF(command_name, ''), 'unknown') AS command_name,
         COUNT(*)::int AS uses
       FROM command_usage
       WHERE ${whereClause}
       GROUP BY command_name
       ORDER BY uses DESC, command_name ASC
       LIMIT $${values.length}`,
      values,
    );
    return { rows: result.rows, available: true };
  } catch (err) {
    warn('Command usage analytics query failed', {
      guildId,
      error: err.message,
    });
    return { rows: [], available: false };
  }
}
