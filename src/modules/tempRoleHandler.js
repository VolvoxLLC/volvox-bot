/**
 * Temporary Role Handler
 *
 * Core logic for assigning roles with an expiry date, polling for expired
 * assignments, and removing roles automatically when they expire.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';

/** @type {ReturnType<typeof setInterval> | null} */
let schedulerInterval = null;

/** @type {boolean} */
let pollInFlight = false;

/**
 * Assign a temporary role to a user.
 *
 * @param {object} params
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Target user ID
 * @param {string} params.userTag - Target user tag
 * @param {string} params.roleId - Role ID to assign
 * @param {string} params.roleName - Role name (for display)
 * @param {string} params.moderatorId - Moderator user ID
 * @param {string} params.moderatorTag - Moderator user tag
 * @param {string} params.duration - Human-readable duration string
 * @param {Date} params.expiresAt - Expiry timestamp
 * @param {string|null} [params.reason] - Optional reason
 * @returns {Promise<object>} Created temp_role row
 * @throws {Error} If database operation fails
 */
export async function assignTempRole({
  guildId,
  userId,
  userTag,
  roleId,
  roleName,
  moderatorId,
  moderatorTag,
  duration,
  expiresAt,
  reason = null,
}) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO temp_roles
        (guild_id, user_id, user_tag, role_id, role_name, moderator_id, moderator_tag, reason, duration, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        guildId,
        userId,
        userTag,
        roleId,
        roleName,
        moderatorId,
        moderatorTag,
        reason,
        duration,
        expiresAt,
      ],
    );

    info('Temp role assigned', { guildId, userId, roleId, roleName, duration });
    return rows[0];
  } catch (err) {
    logError('Failed to assign temp role', { error: err.message, guildId, userId, roleId });
    throw new Error(`Failed to assign temp role: ${err.message}`);
  }
}

/**
 * Revoke a temporary role early (before expiry) by record ID.
 * This is the preferred method for dashboard-initiated revokes.
 *
 * @param {number} id - Record ID to revoke
 * @param {string} guildId - Discord guild ID (for validation)
 * @returns {Promise<object|null>} Updated row or null if not found
 * @throws {Error} If database operation fails
 */
export async function revokeTempRoleById(id, guildId) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE temp_roles
       SET removed = TRUE, removed_at = NOW()
       WHERE id = $1 AND guild_id = $2 AND removed = FALSE
       RETURNING *`,
      [id, guildId],
    );

    if (rows.length > 0) {
      info('Temp role revoked by ID', { id, guildId, userId: rows[0].user_id, roleId: rows[0].role_id });
    }

    return rows[0] || null;
  } catch (err) {
    logError('Failed to revoke temp role by ID', { error: err.message, id, guildId });
    throw new Error(`Failed to revoke temp role: ${err.message}`);
  }
}

/**
 * Revoke a temporary role early (before expiry).
 * Note: This can affect multiple rows if the same user has the same role multiple times.
 * Prefer revokeTempRoleById for precise revocation.
 *
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Target user ID
 * @param {string} roleId - Role ID to revoke
 * @returns {Promise<object|null>} Updated row or null if not found
 * @throws {Error} If database operation fails
 */
export async function revokeTempRole(guildId, userId, roleId) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE temp_roles
       SET removed = TRUE, removed_at = NOW()
       WHERE guild_id = $1 AND user_id = $2 AND role_id = $3 AND removed = FALSE
       RETURNING *`,
      [guildId, userId, roleId],
    );

    if (rows.length > 0) {
      info('Temp role revoked early', { guildId, userId, roleId });
    }

    return rows[0] || null;
  } catch (err) {
    logError('Failed to revoke temp role', { error: err.message, guildId, userId, roleId });
    throw new Error(`Failed to revoke temp role: ${err.message}`);
  }
}

/**
 * List active (non-expired, non-removed) temp role assignments for a guild.
 * Optionally filter by user.
 *
 * @param {string} guildId - Discord guild ID
 * @param {object} [opts]
 * @param {string} [opts.userId] - Filter by user ID
 * @param {number} [opts.limit] - Max results (default 25)
 * @param {number} [opts.offset] - Offset for pagination (default 0)
 * @returns {Promise<{rows: object[], total: number}>}
 * @throws {Error} If database operation fails
 */
export async function listTempRoles(guildId, { userId, limit = 25, offset = 0 } = {}) {
  try {
    const pool = getPool();

    const conditions = ['guild_id = $1', 'removed = FALSE', 'expires_at > NOW()'];
    const values = [guildId];

    if (userId) {
      conditions.push(`user_id = $${values.length + 1}`);
      values.push(userId);
    }

    const where = conditions.join(' AND ');

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT * FROM temp_roles WHERE ${where} ORDER BY expires_at ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      ),
      pool.query(`SELECT COUNT(*)::integer AS total FROM temp_roles WHERE ${where}`, values),
    ]);

    return { rows, total: countRows[0]?.total || 0 };
  } catch (err) {
    logError('Failed to list temp roles', { error: err.message, guildId });
    throw new Error(`Failed to list temp roles: ${err.message}`);
  }
}

/**
 * Poll for expired temp roles and remove them from Discord.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
async function pollExpiredTempRoles(client) {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM temp_roles
       WHERE removed = FALSE AND expires_at <= NOW()
       ORDER BY expires_at ASC
       LIMIT 50`,
    );

    for (const row of rows) {
      // Optimistic lock — claim before processing to prevent double-processing
      const claim = await pool.query(
        `UPDATE temp_roles SET removed = TRUE, removed_at = NOW()
         WHERE id = $1 AND removed = FALSE RETURNING id`,
        [row.id],
      );
      if (claim.rows.length === 0) continue;

      try {
        const guild = await client.guilds.fetch(row.guild_id);
        const member = await guild.members.fetch(row.user_id).catch(() => null);

        if (member) {
          await member.roles.remove(row.role_id, 'Temp role expired');
          info('Temp role expired and removed', {
            guildId: row.guild_id,
            userId: row.user_id,
            roleId: row.role_id,
            roleName: row.role_name,
          });
        } else {
          info('Temp role expired — member no longer in guild', {
            guildId: row.guild_id,
            userId: row.user_id,
            roleId: row.role_id,
          });
        }
      } catch (err) {
        logError('Failed to remove expired temp role', {
          error: err.message,
          id: row.id,
          guildId: row.guild_id,
          userId: row.user_id,
          roleId: row.role_id,
        });
      }
    }
  } catch (err) {
    logError('Temp role scheduler poll error', { error: err.message });
  } finally {
    pollInFlight = false;
  }
}

/**
 * Start the temp role expiry scheduler.
 * Polls every 60 seconds and immediately on startup.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startTempRoleScheduler(client) {
  if (schedulerInterval) return;

  // Immediate pass on startup to catch missed removals
  pollExpiredTempRoles(client).catch((err) => {
    logError('Initial temp role poll failed', { error: err.message });
  });

  schedulerInterval = setInterval(() => {
    pollExpiredTempRoles(client).catch((err) => {
      logError('Temp role poll failed', { error: err.message });
    });
  }, 60_000);

  info('Temp role scheduler started');
}

/**
 * Stop the temp role scheduler.
 */
export function stopTempRoleScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    info('Temp role scheduler stopped');
  }
}
