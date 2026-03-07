/**
 * Warning Engine
 * Manages warning lifecycle: creation, expiry, decay, querying, and removal.
 * Warnings are stored in the `warnings` table and linked to mod_cases via case_id.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';

/**
 * Severity-to-points mapping. Configurable via config but these are sane defaults.
 * @type {Record<string, number>}
 */
const DEFAULT_SEVERITY_POINTS = {
  low: 1,
  medium: 2,
  high: 3,
};

/** @type {ReturnType<typeof setInterval> | null} */
let expiryInterval = null;

/** @type {boolean} */
let expiryPollInFlight = false;

/**
 * Determine the points assigned to a given severity, honoring config overrides.
 * @param {Object} [config] - Optional bot configuration object that may contain moderation.warnings.severityPoints.
 * @param {string} severity - Severity level key (e.g., 'low', 'medium', 'high').
 * @returns {number} The point value for the severity; uses the configured override when present, otherwise falls back to the default mapping or `1` if unknown.
 */
export function getSeverityPoints(config, severity) {
  const configPoints = config?.moderation?.warnings?.severityPoints;
  if (configPoints && typeof configPoints[severity] === 'number') {
    return configPoints[severity];
  }
  return DEFAULT_SEVERITY_POINTS[severity] ?? 1;
}

/**
 * Compute the expiration Date for a warning based on configured expiry days.
 * @param {Object} [config] - Bot configuration object; uses `config.moderation.warnings.expiryDays`.
 * @returns {Date|null} The calculated expiry Date, or `null` if `expiryDays` is not a positive number (warnings do not expire).
 */
export function calculateExpiry(config) {
  const expiryDays = config?.moderation?.warnings?.expiryDays;
  if (typeof expiryDays !== 'number' || expiryDays <= 0) return null;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + expiryDays);
  return expiry;
}

/**
 * Create a warning record in the database.
 * @param {string} guildId - Discord guild ID.
 * @param {Object} data - Warning data.
 * @param {string} data.userId - Target user ID.
 * @param {string} data.moderatorId - Moderator user ID.
 * @param {string} data.moderatorTag - Moderator display tag.
 * @param {string} [data.reason] - Reason for the warning.
 * @param {string} [data.severity='low'] - Severity level (`low`, `medium`, or `high`).
 * @param {number} [data.caseId] - Linked mod_cases.id.
 * @param {Object} [config] - Bot configuration used to determine points and expiry.
 * @returns {Object} The created warning row.
 */
export async function createWarning(guildId, data, config) {
  const pool = getPool();
  const severity = data.severity || 'low';
  const points = getSeverityPoints(config, severity);
  const expiresAt = calculateExpiry(config);

  const { rows } = await pool.query(
    `INSERT INTO warnings
      (guild_id, user_id, moderator_id, moderator_tag, reason, severity, points, expires_at, case_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      guildId,
      data.userId,
      data.moderatorId,
      data.moderatorTag,
      data.reason || null,
      severity,
      points,
      expiresAt,
      data.caseId || null,
    ],
  );

  const warning = rows[0];

  info('Warning created', {
    guildId,
    warningId: warning.id,
    userId: data.userId,
    severity,
    points,
    expiresAt: expiresAt?.toISOString() || null,
  });

  return warning;
}

/**
 * Retrieve warnings for a user in a guild.
 * @param {string} guildId - Discord guild ID.
 * @param {string} userId - Target user ID.
 * @param {Object} [options] - Query options.
 * @param {boolean} [options.activeOnly=false] - If true, only include active warnings.
 * @param {number} [options.limit=50] - Maximum number of warnings to return.
 * @returns {Object[]} Array of warning rows ordered by newest first.
 */
export async function getWarnings(guildId, userId, options = {}) {
  const pool = getPool();
  const { activeOnly = false, limit = 50 } = options;

  const conditions = ['guild_id = $1', 'user_id = $2'];
  const values = [guildId, userId];

  if (activeOnly) {
    conditions.push('active = TRUE');
  }

  const { rows } = await pool.query(
    `SELECT * FROM warnings
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1}`,
    [...values, limit],
  );

  return rows;
}

/**
 * Get the number of active warnings and the total active warning points for a user in a guild.
 * @param {string} guildId - Guild identifier.
 * @param {string} userId - User identifier to query.
 * @returns {{count: number, points: number}} Object with `count` equal to the number of active warnings and `points` equal to the sum of their points.
 */
export async function getActiveWarningStats(guildId, userId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::integer AS count,
       COALESCE(SUM(points), 0)::integer AS points
     FROM warnings
     WHERE guild_id = $1 AND user_id = $2 AND active = TRUE`,
    [guildId, userId],
  );

  return {
    count: rows[0]?.count ?? 0,
    points: rows[0]?.points ?? 0,
  };
}

/**
 * Edit a warning's reason and/or severity.
 * Recalculates and updates the warning's points when the severity is changed.
 * @param {string} guildId - Discord guild ID.
 * @param {number} warningId - Warning ID.
 * @param {Object} updates - Fields to update.
 * @param {string} [updates.reason] - New reason text.
 * @param {string} [updates.severity] - New severity level (e.g., 'low', 'medium', 'high').
 * @param {Object} [config] - Bot configuration used to recalculate severity points when severity changes.
 * @returns {Object|null} The updated warning row, or `null` if no matching warning was found.
 */
export async function editWarning(guildId, warningId, updates, config) {
  const pool = getPool();

  // Build dynamic SET clause
  const setClauses = ['updated_at = NOW()'];
  const values = [];
  let paramIdx = 1;

  if (updates.reason !== undefined) {
    setClauses.push(`reason = $${paramIdx++}`);
    values.push(updates.reason);
  }

  if (updates.severity !== undefined) {
    setClauses.push(`severity = $${paramIdx++}`);
    values.push(updates.severity);
    // Recalculate points when severity changes
    const newPoints = getSeverityPoints(config, updates.severity);
    setClauses.push(`points = $${paramIdx++}`);
    values.push(newPoints);
  }

  values.push(guildId, warningId);

  const { rows } = await pool.query(
    `UPDATE warnings
     SET ${setClauses.join(', ')}
     WHERE guild_id = $${paramIdx++} AND id = $${paramIdx}
     RETURNING *`,
    values,
  );

  if (rows.length === 0) return null;

  info('Warning edited', {
    guildId,
    warningId,
    updates: Object.keys(updates),
  });

  return rows[0];
}

/**
 * Deactivate a specific active warning and record who removed it and why.
 * @param {string} guildId - Guild identifier the warning belongs to.
 * @param {number} warningId - ID of the warning to remove.
 * @param {string} removedBy - Moderator user ID who performed the removal.
 * @param {string} [removalReason] - Optional reason for the removal.
 * @returns {Object|null} The updated warning row if a warning was deactivated, `null` if no active warning matched.
 */
export async function removeWarning(guildId, warningId, removedBy, removalReason) {
  const pool = getPool();

  const { rows } = await pool.query(
    `UPDATE warnings
     SET active = FALSE, removed_at = NOW(), removed_by = $1, removal_reason = $2, updated_at = NOW()
     WHERE guild_id = $3 AND id = $4 AND active = TRUE
     RETURNING *`,
    [removedBy, removalReason || null, guildId, warningId],
  );

  if (rows.length === 0) return null;

  info('Warning removed', {
    guildId,
    warningId,
    removedBy,
  });

  return rows[0];
}

/**
 * Clear all active warnings for a user in a guild.
 * @param {string} guildId - Discord guild ID.
 * @param {string} userId - Target user ID.
 * @param {string} clearedBy - Moderator user ID who cleared the warnings.
 * @param {string} [reason] - Reason for clearing; defaults to 'Bulk clear' when omitted.
 * @returns {number} Number of warnings cleared.
 */
export async function clearWarnings(guildId, userId, clearedBy, reason) {
  const pool = getPool();

  const { rowCount } = await pool.query(
    `UPDATE warnings
     SET active = FALSE, removed_at = NOW(), removed_by = $1, removal_reason = $2, updated_at = NOW()
     WHERE guild_id = $3 AND user_id = $4 AND active = TRUE`,
    [clearedBy, reason || 'Bulk clear', guildId, userId],
  );

  if (rowCount > 0) {
    info('Warnings cleared', {
      guildId,
      userId,
      clearedBy,
      count: rowCount,
    });
  }

  return rowCount;
}

/**
 * Deactivate active warnings whose expiry timestamp has passed.
 *
 * @returns {number} Number of warnings deactivated; returns 0 if none were expired or if processing failed.
 */
export async function processExpiredWarnings() {
  const pool = getPool();

  try {
    const { rowCount } = await pool.query(
      `UPDATE warnings
       SET active = FALSE, removal_reason = 'Expired', updated_at = NOW()
       WHERE active = TRUE AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    );

    if (rowCount > 0) {
      info('Expired warnings processed', { count: rowCount });
    }

    return rowCount;
  } catch (err) {
    logError('Failed to process expired warnings', { error: err.message });
    return 0;
  }
}

/**
 * Start the warning expiry scheduler.
 *
 * Performs an immediate expiry check and then schedules a poll every 60 seconds to deactivate warnings past their expiry.
 * If the scheduler is already running, the function returns without side effects. Each poll is guarded to prevent concurrent runs.
 */
export function startWarningExpiryScheduler() {
  if (expiryInterval) return;

  // Immediate check on startup
  processExpiredWarnings().catch((err) => {
    logError('Initial warning expiry poll failed', { error: err.message });
  });

  expiryInterval = setInterval(() => {
    if (expiryPollInFlight) return;
    expiryPollInFlight = true;

    processExpiredWarnings()
      .catch((err) => {
        logError('Warning expiry poll failed', { error: err.message });
      })
      .finally(() => {
        expiryPollInFlight = false;
      });
  }, 60_000);

  info('Warning expiry scheduler started');
}

/**
 * Stop the warning expiry scheduler.
 */
export function stopWarningExpiryScheduler() {
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
    info('Warning expiry scheduler stopped');
  }
}
