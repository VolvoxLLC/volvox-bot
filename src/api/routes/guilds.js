/**
 * Guild Routes
 * Endpoints for guild info, config, stats, members, moderation, and actions
 */

import { Router } from 'express';
import { error, info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { safeSend } from '../../utils/safeSend.js';

const router = Router();

/**
 * Config keys that are safe to expose via the API.
 * Everything else (database credentials, API tokens, etc.) is filtered out.
 */
const SAFE_CONFIG_KEYS = ['ai', 'welcome', 'spam', 'moderation', 'logging'];

/**
 * Parse pagination query params with defaults and capping.
 * @param {Object} query - Express req.query
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query) {
  let page = Number.parseInt(query.page, 10) || 1;
  let limit = Number.parseInt(query.limit, 10) || 25;
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Middleware: validate guild ID param and attach guild to req.
 * Returns 404 if the bot is not in the requested guild.
 */
function validateGuild(req, res, next) {
  const { client } = req.app.locals;
  const guild = client.guilds.cache.get(req.params.id);

  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  req.guild = guild;
  next();
}

// Apply guild validation to all routes with :id param
router.param('id', validateGuild);

/**
 * GET /:id — Guild info
 */
router.get('/:id', (req, res) => {
  const guild = req.guild;

  res.json({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    channels: Array.from(guild.channels.cache.values()).map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
    })),
  });
});

/**
 * GET /:id/config — Read guild config (safe keys only)
 * Note: Config is global, not per-guild. The guild ID is accepted for
 * API consistency but does not scope the returned config.
 */
router.get('/:id/config', (_req, res) => {
  const config = getConfig();
  const safeConfig = {};
  for (const key of SAFE_CONFIG_KEYS) {
    if (key in config) {
      safeConfig[key] = config[key];
    }
  }
  res.json(safeConfig);
});

/**
 * PATCH /:id/config — Update a config value (safe keys only)
 * Body: { path: "ai.model", value: "claude-3" }
 * Note: Config is global, not per-guild. The guild ID is accepted for
 * API consistency but does not scope the update.
 */
router.patch('/:id/config', async (req, res) => {
  const { path, value } = req.body;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "path" in request body' });
  }

  if (value === undefined) {
    return res.status(400).json({ error: 'Missing "value" in request body' });
  }

  const topLevelKey = path.split('.')[0];
  if (!SAFE_CONFIG_KEYS.includes(topLevelKey)) {
    return res.status(403).json({ error: 'Modifying this config key is not allowed' });
  }

  try {
    const updated = await setConfigValue(path, value);
    info('Config updated via API', { path, value, guild: req.params.id });
    res.json(updated);
  } catch (err) {
    error('Failed to update config via API', { path, error: err.message });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * GET /:id/stats — Guild statistics
 */
router.get('/:id/stats', async (req, res) => {
  const { dbPool } = req.app.locals;

  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [conversationResult, caseResult] = await Promise.all([
      dbPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE guild_id = $1', [
        req.params.id,
      ]),
      dbPool.query('SELECT COUNT(*)::int AS count FROM mod_cases WHERE guild_id = $1', [
        req.params.id,
      ]),
    ]);

    res.json({
      guildId: req.params.id,
      aiConversations: conversationResult.rows[0].count,
      moderationCases: caseResult.rows[0].count,
      memberCount: req.guild.memberCount,
      uptime: process.uptime(),
    });
  } catch (err) {
    error('Failed to fetch stats', { error: err.message, guild: req.params.id });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /:id/members — Cursor-based paginated member list with roles
 * Query params: ?limit=25&after=<userId> (max 100)
 * Uses Discord's cursor-based pagination via guild.members.list().
 */
router.get('/:id/members', async (req, res) => {
  let limit = Number.parseInt(req.query.limit, 10) || 25;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  const after = req.query.after || undefined;

  try {
    const members = await req.guild.members.list({ limit, after });

    const memberList = Array.from(members.values()).map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      roles: Array.from(m.roles.cache.values()).map((r) => ({ id: r.id, name: r.name })),
      joinedAt: m.joinedAt,
    }));

    const lastMember = memberList[memberList.length - 1];

    res.json({
      limit,
      after: after || null,
      nextAfter: lastMember ? lastMember.id : null,
      members: memberList,
    });
  } catch (err) {
    error('Failed to fetch members', { error: err.message, guild: req.params.id });
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * GET /:id/moderation — Paginated moderation cases
 * Query params: ?page=1&limit=25 (max 100)
 */
router.get('/:id/moderation', async (req, res) => {
  const { dbPool } = req.app.locals;

  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { page, limit, offset } = parsePagination(req.query);

  try {
    const [countResult, casesResult] = await Promise.all([
      dbPool.query('SELECT COUNT(*)::int AS count FROM mod_cases WHERE guild_id = $1', [
        req.params.id,
      ]),
      dbPool.query(
        'SELECT * FROM mod_cases WHERE guild_id = $1 ORDER BY case_number DESC LIMIT $2 OFFSET $3',
        [req.params.id, limit, offset],
      ),
    ]);

    res.json({
      page,
      limit,
      total: countResult.rows[0].count,
      cases: casesResult.rows,
    });
  } catch (err) {
    error('Failed to fetch moderation cases', { error: err.message, guild: req.params.id });
    res.status(500).json({ error: 'Failed to fetch moderation cases' });
  }
});

/**
 * POST /:id/actions — Execute bot actions
 * Body: { action: "sendMessage", channelId: "...", content: "..." }
 */
router.post('/:id/actions', async (req, res) => {
  const { action, channelId, content } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing "action" in request body' });
  }

  if (action === 'sendMessage') {
    if (!channelId || !content) {
      return res.status(400).json({ error: 'Missing "channelId" or "content" for sendMessage' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Content exceeds Discord 2000 character limit' });
    }

    // Validate channel belongs to guild
    const channel = req.guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found in this guild' });
    }

    if (!channel.isTextBased()) {
      return res.status(400).json({ error: 'Channel is not a text channel' });
    }

    try {
      const message = await safeSend(channel, content);
      info('Message sent via API', { guild: req.params.id, channel: channelId });
      const sent = Array.isArray(message) ? message[0] : message;
      res.status(201).json({ id: sent.id, channelId, content: sent.content });
    } catch (err) {
      error('Failed to send message via API', { error: err.message, guild: req.params.id });
      res.status(500).json({ error: 'Failed to send message' });
    }
  } else {
    res.status(400).json({ error: 'Unsupported action type' });
  }
});

export default router;
