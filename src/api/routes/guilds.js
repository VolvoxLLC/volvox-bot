/**
 * Guild Routes
 * Endpoints for guild info, config, stats, members, moderation, and actions
 */

import { Router } from 'express';
import { error, info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { safeSend } from '../../utils/safeSend.js';
import { fetchUserGuilds, guildCache, stopGuildCacheCleanup } from '../utils/discordApi.js';
import { getSessionToken } from './auth.js';

const router = Router();

/** Discord ADMINISTRATOR permission flag */
const ADMINISTRATOR_FLAG = 0x8;

/**
 * Config keys that are safe to write via the PATCH endpoint.
 * 'moderation' is intentionally excluded to prevent API callers from
 * weakening or disabling moderation settings.
 */
const SAFE_CONFIG_KEYS = ['ai', 'welcome', 'spam'];

/**
 * Config keys that are safe to read via the GET endpoint.
 * Includes everything in SAFE_CONFIG_KEYS plus read-only keys.
 */
const READABLE_CONFIG_KEYS = [...SAFE_CONFIG_KEYS, 'moderation'];

/**
 * Upper bound on content length for abuse prevention.
 * safeSend handles the actual Discord 2000-char message splitting.
 */
const MAX_CONTENT_LENGTH = 10000;

/**
 * Parse pagination query params with defaults and capping.
 *
 * Currently used only by the moderation endpoint; the members endpoint
 * uses cursor-based pagination instead.
 *
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

export { guildCache, stopGuildCacheCleanup };

/**
 * Check if an OAuth2 user has admin permissions on a guild.
 * Fetches fresh guild list from Discord using the access token from the session store.
 *
 * @param {Object} user - Decoded JWT user payload
 * @param {string} guildId - Guild ID to check
 * @returns {Promise<boolean>} True if user has ADMINISTRATOR permission
 */
async function isOAuthGuildAdmin(user, guildId) {
  const accessToken = getSessionToken(user?.userId);
  if (!accessToken) return false;
  const guilds = await fetchUserGuilds(user.userId, accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) return false;
  return (Number(guild.permissions) & ADMINISTRATOR_FLAG) === ADMINISTRATOR_FLAG;
}

/**
 * Middleware: verify OAuth2 users are guild admins.
 * API-secret users are trusted and pass through.
 */
async function requireGuildAdmin(req, res, next) {
  if (req.authMethod === 'api-secret') return next();

  if (req.authMethod === 'oauth') {
    try {
      if (!(await isOAuthGuildAdmin(req.user, req.params.id))) {
        return res.status(403).json({ error: 'You do not have admin access to this guild' });
      }
      return next();
    } catch (err) {
      error('Failed to verify guild admin status', { error: err.message, guild: req.params.id });
      return res.status(502).json({ error: 'Failed to verify guild permissions with Discord' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
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
 * GET / — List guilds
 * For OAuth2 users: fetches fresh guilds from Discord, returns only those where user has admin AND bot is present
 * For api-secret users: returns all bot guilds
 */
router.get('/', async (req, res) => {
  const { client } = req.app.locals;
  const botGuilds = client.guilds.cache;

  if (req.authMethod === 'oauth') {
    const accessToken = getSessionToken(req.user?.userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Missing access token' });
    }

    try {
      const userGuilds = await fetchUserGuilds(req.user.userId, accessToken);
      const filtered = userGuilds
        .filter((ug) => {
          // User must have admin permission on the guild
          if ((Number(ug.permissions) & ADMINISTRATOR_FLAG) !== ADMINISTRATOR_FLAG) return false;
          // Bot must be present in the guild
          return botGuilds.has(ug.id);
        })
        .map((ug) => {
          const botGuild = botGuilds.get(ug.id);
          if (!botGuild) return null;
          return {
            id: ug.id,
            name: botGuild.name,
            icon: botGuild.iconURL(),
            memberCount: botGuild.memberCount,
          };
        })
        .filter(Boolean);

      return res.json(filtered);
    } catch (err) {
      error('Failed to fetch user guilds from Discord', { error: err.message });
      return res.status(502).json({ error: 'Failed to fetch guilds from Discord' });
    }
  }

  // api-secret: return all bot guilds
  const guilds = Array.from(botGuilds.values()).map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL(),
    memberCount: g.memberCount,
  }));

  res.json(guilds);
});

/**
 * GET /:id — Guild info
 */
router.get('/:id', (req, res) => {
  const guild = req.guild;
  const MAX_CHANNELS = 500;
  const channels = [];
  for (const ch of guild.channels.cache.values()) {
    if (channels.length >= MAX_CHANNELS) break;
    // type is discord.js ChannelType enum: 0=GuildText, 2=GuildVoice, 4=GuildCategory,
    // 5=GuildAnnouncement, 13=GuildStageVoice, 15=GuildForum, 16=GuildMedia
    channels.push({ id: ch.id, name: ch.name, type: ch.type });
  }

  res.json({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    channels,
  });
});

/**
 * GET /:id/config — Read guild config (safe keys only)
 * Note: Config is global, not per-guild. The guild ID is accepted for
 * API consistency but does not scope the returned config.
 * Per-guild config is tracked in Issue #71.
 */
router.get('/:id/config', requireGuildAdmin, (_req, res) => {
  const config = getConfig();
  const safeConfig = {};
  for (const key of READABLE_CONFIG_KEYS) {
    if (key in config) {
      safeConfig[key] = config[key];
    }
  }
  res.json({
    scope: 'global',
    note: 'Config is global, not per-guild. Per-guild config is tracked in Issue #71.',
    ...safeConfig,
  });
});

/**
 * PATCH /:id/config — Update a config value (safe keys only)
 * Body: { path: "ai.model", value: "claude-3" }
 * Note: Config is global, not per-guild. The guild ID is accepted for
 * API consistency but does not scope the update.
 * Per-guild config is tracked in Issue #71.
 */
router.patch('/:id/config', requireGuildAdmin, async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required' });
  }

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

  if (!path.includes('.')) {
    return res
      .status(400)
      .json({ error: 'Config path must include at least one dot separator (e.g., "ai.model")' });
  }

  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    return res.status(400).json({ error: 'Config path contains empty segments' });
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
router.get('/:id/stats', requireGuildAdmin, async (req, res) => {
  const { dbPool } = req.app.locals;

  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    /**
     * Note: Pre-existing conversation rows (from before guild tracking was added)
     * may have NULL guild_id and won't be counted here. These will self-correct
     * as new conversations are created with the guild_id populated.
     */
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
router.get('/:id/members', requireGuildAdmin, async (req, res) => {
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
router.get('/:id/moderation', requireGuildAdmin, async (req, res) => {
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
        `SELECT id, guild_id, case_number, action, target_id, target_tag,
                moderator_id, moderator_tag, reason, duration, expires_at,
                log_message_id, created_at
         FROM mod_cases
         WHERE guild_id = $1
         ORDER BY case_number DESC
         LIMIT $2 OFFSET $3`,
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
router.post('/:id/actions', requireGuildAdmin, async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  const { action, channelId, content } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing "action" in request body' });
  }

  if (action === 'sendMessage') {
    if (!channelId || !content) {
      return res.status(400).json({ error: 'Missing "channelId" or "content" for sendMessage' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return res
        .status(400)
        .json({ error: `Content exceeds ${MAX_CONTENT_LENGTH} character limit` });
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
      // safeSend sanitizes mentions internally via prepareOptions() → sanitizeMessageOptions()
      const message = await safeSend(channel, content);
      info('Message sent via API', { guild: req.params.id, channel: channelId });
      // If content exceeded 2000 chars, safeSend splits into multiple messages;
      // we return the first chunk's content and ID
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
