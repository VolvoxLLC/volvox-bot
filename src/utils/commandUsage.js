/**
 * Command Usage Tracking Utilities
 *
 * Provides functions for logging slash-command usage to a dedicated table.
 * This decouples dashboard analytics from log transport availability.
 */

import { getPool } from '../db.js';
import { error as logError } from '../logger.js';
import {
  COMMAND_USAGE_COLUMNS,
  COMMAND_USAGE_DEFAULT_LIMIT,
  COMMAND_USAGE_MAX_LIMIT,
  COMMAND_USAGE_TABLE,
} from './commandUsageContract.js';

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
      `INSERT INTO ${COMMAND_USAGE_TABLE} (${COMMAND_USAGE_COLUMNS.guildId}, ${COMMAND_USAGE_COLUMNS.userId}, ${COMMAND_USAGE_COLUMNS.commandName}, ${COMMAND_USAGE_COLUMNS.channelId})
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
 * Normalize a command usage query limit and cap it to safe bounds.
 *
 * @param {unknown} rawLimit
 * @returns {number}
 */
export function normalizeCommandUsageLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return COMMAND_USAGE_DEFAULT_LIMIT;
  }

  return Math.min(parsed, COMMAND_USAGE_MAX_LIMIT);
}

/**
 * Build a parameterized command usage stats query.
 *
 * @param {Object} params
 * @param {string} params.guildId
 * @param {Date|string} [params.startDate]
 * @param {Date|string} [params.endDate]
 * @param {string|null} [params.channelId]
 * @param {number|string} [params.limit]
 * @returns {{ text: string, values: Array<string|Date|number> }}
 */
export function buildCommandUsageStatsQuery({
  guildId,
  startDate,
  endDate,
  channelId = null,
  limit = COMMAND_USAGE_DEFAULT_LIMIT,
}) {
  if (!guildId) {
    throw new Error('guildId is required');
  }

  const normalizedLimit = normalizeCommandUsageLimit(limit);
  const conditions = [`${COMMAND_USAGE_COLUMNS.guildId} = $1`];
  const values = [guildId];

  if (startDate) {
    conditions.push(`${COMMAND_USAGE_COLUMNS.usedAt} >= $${values.length + 1}`);
    values.push(startDate);
  }

  if (endDate) {
    conditions.push(`${COMMAND_USAGE_COLUMNS.usedAt} <= $${values.length + 1}`);
    values.push(endDate);
  }

  if (channelId) {
    conditions.push(`${COMMAND_USAGE_COLUMNS.channelId} = $${values.length + 1}`);
    values.push(channelId);
  }

  values.push(normalizedLimit);
  const limitParam = `$${values.length}`;

  return {
    text: `SELECT
       ${COMMAND_USAGE_COLUMNS.commandName} AS "commandName",
       COUNT(*)::int AS uses
     FROM ${COMMAND_USAGE_TABLE}
     WHERE ${conditions.join(' AND ')}
     GROUP BY ${COMMAND_USAGE_COLUMNS.commandName}
     ORDER BY uses DESC, ${COMMAND_USAGE_COLUMNS.commandName} ASC
     LIMIT ${limitParam}`,
    values,
  };
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
  const { startDate, endDate, limit } = options;
  const { text, values } = buildCommandUsageStatsQuery({
    guildId,
    startDate,
    endDate,
    limit,
  });
  const pool = getPool();
  const { rows } = await pool.query(text, values);

  return rows;
}
