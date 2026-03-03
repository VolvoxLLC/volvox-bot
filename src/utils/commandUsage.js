/**
 * Command Usage Tracking Utilities
 *
 * Provides functions for logging slash-command usage to a dedicated table.
 * This decouples dashboard analytics from log transport availability.
 */

import { getPool } from '../db.js';
import { error as logError } from '../logger.js';

/**
 * Log a command usage event to the database.
 *
 * @param {Object} params - Command usage parameters
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Discord user ID
 * @param {string} params.commandName - Name of the command
 * @param {string} [params.channelId] - Discord channel ID (optional)
 * @returns {Promise<void>}
 */
export async function logCommandUsage({ guildId, userId, commandName, channelId }) {
  if (!guildId || !userId || !commandName) {
    logError('logCommandUsage called with missing required parameters', {
      guildId,
      userId,
      commandName,
    });
    return;
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO command_usage (guild_id, user_id, command_name, channel_id)
       VALUES ($1, $2, $3, $4)`,
      [guildId, userId, commandName, channelId ?? null],
    );
  } catch (err) {
    // Don't fail command execution if logging fails
    logError('Failed to log command usage', {
      guildId,
      userId,
      commandName,
      error: err.message,
    });
  }
}

/**
 * Get command usage statistics for a guild.
 *
 * @param {string} guildId - Discord guild ID
 * @param {Object} [options] - Query options
 * @param {Date} [options.startDate] - Start date for the query range
 * @param {Date} [options.endDate] - End date for the query range
 * @param {number} [options.limit=15] - Maximum number of commands to return
 * @returns {Promise<Array<{commandName: string, uses: number}>>}
 */
export async function getCommandUsageStats(guildId, options = {}) {
  if (!guildId) {
    throw new Error('guildId is required');
  }

  // Validate and sanitize limit parameter
  let { limit = 15 } = options;
  limit = parseInt(limit, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    limit = 15;
  }
  limit = Math.min(limit, 100); // Cap at 100 for safety

  const { startDate, endDate } = options;

  const conditions = ['guild_id = $1'];
  const values = [guildId];
  let paramIndex = 2;

  if (startDate) {
    conditions.push(`used_at >= $${paramIndex}`);
    values.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`used_at <= $${paramIndex}`);
    values.push(endDate);
    paramIndex++;
  }

  values.push(limit);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       command_name AS "commandName",
       COUNT(*)::int AS uses
     FROM command_usage
     WHERE ${conditions.join(' AND ')}
     GROUP BY command_name
     ORDER BY uses DESC, command_name ASC
     LIMIT $${paramIndex}`,
    values,
  );

  return rows;
}
