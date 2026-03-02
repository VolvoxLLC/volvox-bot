/**
 * Temp Roles API Routes
 * Exposes temporary role assignment data for the web dashboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import { Router } from 'express';
import { info, error as logError } from '../../logger.js';
import { assignTempRole, listTempRoles, revokeTempRole } from '../../modules/tempRoleHandler.js';
import { formatDuration, parseDuration } from '../../utils/duration.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { parsePagination, requireGuildModerator } from './guilds.js';

const router = Router();

/** Rate limiter — 120 req / 15 min per IP */
const tempRoleRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

/**
 * Adapt ?guildId= query param to :id path param for requireGuildModerator.
 */
function adaptGuildIdParam(req, _res, next) {
  if (req.query.guildId) {
    req.params.id = req.query.guildId;
  }
  next();
}

router.use(tempRoleRateLimit);
router.use(adaptGuildIdParam, requireGuildModerator);

// ─── GET /temp-roles ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /temp-roles:
 *   get:
 *     tags: [TempRoles]
 *     summary: List active temp role assignments
 *     parameters:
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *     responses:
 *       "200":
 *         description: Paginated list of active temp roles
 */
router.get('/', async (req, res) => {
  try {
    const guildId = req.query.guildId;
    const userId = req.query.userId || undefined;
    const { page, limit, offset } = parsePagination(req.query);

    const { rows, total } = await listTempRoles(guildId, { userId, limit, offset });

    return res.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logError('GET /temp-roles failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to fetch temp roles' });
  }
});

// ─── DELETE /temp-roles/:id ───────────────────────────────────────────────────

/**
 * @openapi
 * /temp-roles/{id}:
 *   delete:
 *     tags: [TempRoles]
 *     summary: Revoke a temp role by record ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       "200": { description: Revoked }
 *       "404": { description: Not found or already removed }
 */
router.delete('/:id', async (req, res) => {
  try {
    const guildId = req.query.guildId;
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const pool = (await import('../../db.js')).getPool();

    // Fetch the record first to get user/role IDs
    const { rows: existing } = await pool.query(
      'SELECT * FROM temp_roles WHERE id = $1 AND guild_id = $2 AND removed = FALSE',
      [id, guildId],
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Temp role not found or already removed' });
    }

    const record = existing[0];

    // Mark removed in DB
    const updated = await revokeTempRole(guildId, record.user_id, record.role_id);
    if (!updated) {
      return res.status(404).json({ error: 'Temp role not found or already removed' });
    }

    // Best-effort Discord role removal
    try {
      const client = res.app.locals.client;
      if (client) {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(record.user_id).catch(() => null);
        if (member) {
          await member.roles.remove(record.role_id, 'Temp role revoked via dashboard');
        }
      }
    } catch (discordErr) {
      logError('Dashboard revoke: Discord role removal failed', { error: discordErr.message });
    }

    info('Temp role revoked via dashboard', {
      guildId,
      userId: record.user_id,
      roleId: record.role_id,
      moderatorId: req.user?.id,
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    logError('DELETE /temp-roles/:id failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to revoke temp role' });
  }
});

// ─── POST /temp-roles ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /temp-roles:
 *   post:
 *     tags: [TempRoles]
 *     summary: Assign a temp role via the dashboard
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guildId, userId, roleId, duration]
 *             properties:
 *               guildId: { type: string }
 *               userId: { type: string }
 *               roleId: { type: string }
 *               duration: { type: string, example: "7d" }
 *               reason: { type: string }
 *     responses:
 *       "201": { description: Assigned }
 *       "400": { description: Invalid input }
 */
router.post('/', async (req, res) => {
  try {
    const { guildId, userId, roleId, duration: durationStr, reason } = req.body || {};

    if (!guildId || !userId || !roleId || !durationStr) {
      return res.status(400).json({ error: 'guildId, userId, roleId, and duration are required' });
    }

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return res.status(400).json({ error: 'Invalid duration. Use e.g. 1h, 7d, 2w.' });
    }

    const client = res.app.locals.client;
    if (!client) {
      return res.status(503).json({ error: 'Discord client not available' });
    }

    let guild, member, role;
    try {
      guild = await client.guilds.fetch(guildId);
      member = await guild.members.fetch(userId);
      role = await guild.roles.fetch(roleId);
    } catch {
      return res.status(400).json({ error: 'Invalid guild, user, or role' });
    }

    if (!role) {
      return res.status(400).json({ error: 'Role not found' });
    }

    // Assign in Discord
    await member.roles.add(roleId, reason || 'Temp role assigned via dashboard');

    const expiresAt = new Date(Date.now() + durationMs);
    const duration = formatDuration(durationMs);

    const record = await assignTempRole({
      guildId,
      userId,
      userTag: member.user.tag,
      roleId,
      roleName: role.name,
      moderatorId: req.user?.id || 'dashboard',
      moderatorTag: req.user?.tag || 'Dashboard',
      duration,
      expiresAt,
      reason: reason || null,
    });

    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    logError('POST /temp-roles failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to assign temp role' });
  }
});

export default router;
