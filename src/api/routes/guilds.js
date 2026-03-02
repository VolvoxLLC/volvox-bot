/**
 * Guild Routes
 * Endpoints for guild info, config, stats, members, moderation, and actions
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';
import { safeSend } from '../../utils/safeSend.js';
import {
  maskSensitiveFields,
  READABLE_CONFIG_KEYS,
  SAFE_CONFIG_KEYS,
} from '../utils/configAllowlist.js';
import { fetchUserGuilds } from '../utils/discordApi.js';
import { getSessionToken } from '../utils/sessionStore.js';
import { validateConfigPatchBody } from '../utils/validateConfigPatch.js';
import { fireAndForgetWebhook } from '../utils/webhook.js';

const router = Router();

/** Discord ADMINISTRATOR permission flag */
const ADMINISTRATOR_FLAG = 0x8;
/** Discord MANAGE_GUILD permission flag */
const MANAGE_GUILD_FLAG = 0x20;

/**
 * Upper bound on content length for abuse prevention.
 * safeSend handles the actual Discord 2000-char message splitting.
 */
const MAX_CONTENT_LENGTH = 10000;

/**
 * Parse pagination query parameters and return normalized page, limit, and offset.
 *
 * @param {Object} query - Query object (for example, Express `req.query`) possibly containing `page` and `limit`.
 * @returns {{page: number, limit: number, offset: number}} page is at least 1, limit is between 1 and 100, offset equals `(page - 1) * limit`.
 */
export function parsePagination(query) {
  let page = Number.parseInt(query.page, 10) || 1;
  let limit = Number.parseInt(query.limit, 10) || 25;
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

const MAX_ANALYTICS_RANGE_DAYS = 90;
const ACTIVE_CONVERSATION_WINDOW_MINUTES = 15;

class AnalyticsRangeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsRangeValidationError';
  }
}

/**
 * Parse and validate a date-ish query param.
 * @param {unknown} value
 * @returns {Date|null}
 */
function parseDateParam(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Build a date range from query params.
 * Supports presets: today, week, month, custom.
 *
 * @param {Object} query - Express req.query
 * @returns {{ from: Date, to: Date, range: 'today'|'week'|'month'|'custom' }}
 */
function parseAnalyticsRange(query) {
  const now = new Date();
  const rawRange = typeof query.range === 'string' ? query.range.toLowerCase() : 'week';
  const range = ['today', 'week', 'month', 'custom'].includes(rawRange) ? rawRange : 'week';

  if (range === 'custom') {
    const from = parseDateParam(query.from);
    const to = parseDateParam(query.to);

    if (!from || !to) {
      throw new AnalyticsRangeValidationError(
        'Custom range requires valid "from" and "to" query params',
      );
    }
    if (from > to) {
      throw new AnalyticsRangeValidationError('"from" must be before "to"');
    }

    const maxRangeMs = MAX_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRangeMs) {
      throw new AnalyticsRangeValidationError(
        `Custom range cannot exceed ${MAX_ANALYTICS_RANGE_DAYS} days`,
      );
    }

    return { from, to, range: 'custom' };
  }

  const from = new Date(now);
  if (range === 'today') {
    from.setUTCHours(0, 0, 0, 0);
  } else if (range === 'month') {
    // Use UTC-based date arithmetic for consistency with setUTCHours above
    const utcTime = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 30);
    from.setTime(utcTime);
  } else {
    // Default: week - use UTC-based date arithmetic
    const utcTime = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 7);
    from.setTime(utcTime);
  }

  return { from, to: now, range };
}

/**
 * Infer/validate analytics interval bucket size.
 *
 * @param {Object} query - Express req.query
 * @param {Date} from
 * @param {Date} to
 * @returns {'hour'|'day'}
 */
function parseAnalyticsInterval(query, from, to) {
  if (query.interval === 'hour' || query.interval === 'day') {
    return query.interval;
  }

  // Auto: use hour for short windows (<= 48h), day otherwise.
  const diffMs = to.getTime() - from.getTime();
  return diffMs <= 48 * 60 * 60 * 1000 ? 'hour' : 'day';
}

/**
 * Parse optional comparison-mode query flag.
 * Accepts compare=1|true|yes|on.
 *
 * @param {Object} query - Express req.query
 * @returns {boolean}
 */
function parseComparisonMode(query) {
  if (typeof query.compare !== 'string') return false;
  const value = query.compare.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/**
 * Human-friendly chart label for a time bucket.
 * @param {Date} bucket
 * @param {'hour'|'day'} interval
 * @returns {string}
 */
function formatBucketLabel(bucket, interval) {
  if (interval === 'hour') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }).format(bucket);
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(bucket);
}

/**
 * Determine whether an OAuth2 user has any of the specified permission flags for a guild.
 *
 * @param {Object} user - Decoded JWT user payload containing at minimum `userId`.
 * @param {string} guildId - Discord guild ID to check.
 * @param {number} anyOfFlags - Bitmask of Discord permission flags; returns `true` if any bit in this mask is present on the user's guild permissions.
 * @returns {boolean} `true` if the user has any of the specified permission flags on the guild, `false` otherwise.
 */
async function hasOAuthGuildPermission(user, guildId, anyOfFlags) {
  try {
    const accessToken = await getSessionToken(user?.userId);
    if (!accessToken) return false;
    const guilds = await fetchUserGuilds(user.userId, accessToken);
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return false;
    const permissions = Number(guild.permissions);
    if (Number.isNaN(permissions)) return false;
    return (permissions & anyOfFlags) !== 0;
  } catch (err) {
    error('Error in hasOAuthGuildPermission (session lookup or guild fetch)', {
      error: err.message,
      userId: user?.userId,
      guildId,
    });
    throw err;
  }
}

/**
 * Determine if the authenticated OAuth2 user is configured as a bot owner.
 *
 * @param {Object} user - Decoded JWT user payload; expected to include `userId`.
 * @returns {boolean} `true` if `user.userId` is listed in the application bot owner IDs, `false` otherwise.
 */
function isOAuthBotOwner(user) {
  const botOwners = getBotOwnerIds(getConfig());
  return botOwners.includes(user?.userId);
}

/**
 * Check if an OAuth2 user has admin permissions on a guild.
 * Admin = ADMINISTRATOR only, aligning with the slash-command isAdmin check.
 *
 * @param {Object} user - Decoded JWT user payload
 * @param {string} guildId - Guild ID to check
 * @returns {Promise<boolean>} True if user has admin-level permission
 */
function isOAuthGuildAdmin(user, guildId) {
  return hasOAuthGuildPermission(user, guildId, ADMINISTRATOR_FLAG);
}

/**
 * Check if an OAuth2 user has moderator permissions on a guild.
 * Moderator = ADMINISTRATOR or MANAGE_GUILD, aligning with the slash-command isModerator check.
 *
 * @param {Object} user - Decoded JWT user payload
 * @param {string} guildId - Guild ID to check
 * @returns {Promise<boolean>} True if user has moderator-level permission
 */
function isOAuthGuildModerator(user, guildId) {
  return hasOAuthGuildPermission(user, guildId, ADMINISTRATOR_FLAG | MANAGE_GUILD_FLAG);
}

/**
 * Return Express middleware that enforces a guild-level permission for OAuth users.
 *
 * The middleware bypasses checks for API-secret requests and for configured bot owners.
 * For OAuth-authenticated requests it calls `permissionCheck(user, guildId)` and:
 * - responds 403 with `errorMessage` when the check resolves to `false`,
 * - responds 502 when the permission verification throws,
 * - otherwise allows the request to continue.
 * Unknown or missing auth methods receive a 401 response.
 *
 * @param {(user: Object, guildId: string) => Promise<boolean>} permissionCheck - Function that returns `true` if the provided user has the required permission in the specified guild, `false` otherwise.
 * @param {string} errorMessage - Message to include in the 403 response when permission is denied.
 * @returns {import('express').RequestHandler} Express middleware enforcing the permission.
 */
function requireGuildPermission(permissionCheck, errorMessage) {
  return async (req, res, next) => {
    if (req.authMethod === 'api-secret') return next();

    if (req.authMethod === 'oauth') {
      if (isOAuthBotOwner(req.user)) return next();

      try {
        if (!(await permissionCheck(req.user, req.params.id))) {
          return res.status(403).json({ error: errorMessage });
        }
        return next();
      } catch (err) {
        error('Failed to verify guild permission', {
          error: err.message,
          guild: req.params.id,
          userId: req.user?.userId,
        });
        return res.status(502).json({ error: 'Failed to verify guild permissions with Discord' });
      }
    }

    warn('Unknown authMethod in guild permission check', {
      authMethod: req.authMethod,
      path: req.path,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

/** Middleware: verify OAuth2 users are guild admins. API-secret users pass through. */
export const requireGuildAdmin = requireGuildPermission(
  isOAuthGuildAdmin,
  'You do not have admin access to this guild',
);

/** Middleware: verify OAuth2 users are guild moderators. API-secret users pass through. */
export const requireGuildModerator = requireGuildPermission(
  isOAuthGuildModerator,
  'You do not have moderator access to this guild',
);

/**
 * Validate that the requested guild exists and attach it to req.guild.
 *
 * If the bot is not present in the guild identified by req.params.id, sends a 404
 * response with `{ error: 'Guild not found' }` and does not call `next()`. Otherwise
 * sets `req.guild` to the Guild instance and calls `next()`.
 */
export function validateGuild(req, res, next) {
  const { client } = req.app.locals;
  const guild = client.guilds.cache.get(req.params.id);

  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  req.guild = guild;
  next();
}

/**
 * @openapi
 * /guilds:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: List guilds
 *     description: >
 *       For OAuth users: returns guilds where the user has MANAGE_GUILD or ADMINISTRATOR.
 *       Bot owners see all guilds. For API-secret users: returns all bot guilds.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: Guild list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   icon:
 *                     type: string
 *                     nullable: true
 *                   memberCount:
 *                     type: integer
 *                   access:
 *                     type: string
 *                     enum: [admin, moderator, bot-owner]
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "502":
 *         description: Failed to fetch guilds from Discord
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/', async (req, res) => {
  const { client } = req.app.locals;
  const botGuilds = client.guilds.cache;

  if (req.authMethod === 'oauth') {
    if (isOAuthBotOwner(req.user)) {
      const ownerGuilds = Array.from(botGuilds.values()).map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL(),
        memberCount: g.memberCount,
        access: 'bot-owner',
      }));
      return res.json(ownerGuilds);
    }

    let accessToken;
    try {
      accessToken = await getSessionToken(req.user?.userId);
    } catch (err) {
      error('Redis error fetching session token in GET /guilds', {
        error: err.message,
        userId: req.user?.userId,
      });
      return res.status(503).json({ error: 'Session store unavailable' });
    }
    if (!accessToken) {
      return res.status(401).json({ error: 'Missing access token' });
    }

    try {
      const userGuilds = await fetchUserGuilds(req.user.userId, accessToken);
      const filtered = userGuilds.reduce((acc, ug) => {
        const permissions = Number(ug.permissions);
        const hasAdmin = (permissions & ADMINISTRATOR_FLAG) !== 0;
        const hasManageGuild = (permissions & MANAGE_GUILD_FLAG) !== 0;
        const access = hasAdmin ? 'admin' : hasManageGuild ? 'moderator' : null;
        if (!access) return acc;

        // Single lookup avoids has/get TOCTOU.
        const botGuild = botGuilds.get(ug.id);
        if (!botGuild) return acc;
        acc.push({
          id: ug.id,
          name: botGuild.name,
          icon: botGuild.iconURL(),
          memberCount: botGuild.memberCount,
          access,
        });
        return acc;
      }, []);

      return res.json(filtered);
    } catch (err) {
      error('Failed to fetch user guilds from Discord', {
        error: err.message,
        userId: req.user?.userId,
      });
      return res.status(502).json({ error: 'Failed to fetch guilds from Discord' });
    }
  }

  if (req.authMethod === 'api-secret') {
    const guilds = Array.from(botGuilds.values()).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL(),
      memberCount: g.memberCount,
    }));
    return res.json(guilds);
  }

  // Unknown auth method — reject
  warn('Unknown authMethod in guild list', { authMethod: req.authMethod, path: req.path });
  return res.status(401).json({ error: 'Unauthorized' });
});

/** Maximum number of channels to return to avoid oversized payloads. */
const MAX_CHANNELS = 500;

/** Maximum number of roles to return to avoid oversized payloads. */
const MAX_ROLES = 250;

/**
 * Return a capped list of channels for a guild.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {{ id: string, name: string, type: number }[]}
 */
function getGuildChannels(guild) {
  // type is discord.js ChannelType enum: 0=GuildText, 2=GuildVoice, 4=GuildCategory,
  // 5=GuildAnnouncement, 13=GuildStageVoice, 15=GuildForum, 16=GuildMedia
  const channels = [];
  for (const ch of guild.channels.cache.values()) {
    if (channels.length >= MAX_CHANNELS) break;
    channels.push({ id: ch.id, name: ch.name, type: ch.type });
  }
  return channels;
}

/**
 * @openapi
 * /guilds/{id}:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: Get guild info
 *     description: Returns detailed information about a specific guild.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild ID
 *     responses:
 *       "200":
 *         description: Guild details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 icon:
 *                   type: string
 *                   nullable: true
 *                 memberCount:
 *                   type: integer
 *                 channels:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: integer
 *                         description: "Discord channel type enum (0=Text, 2=Voice, 4=Category, 5=Announcement, 13=Stage, 15=Forum, 16=Media)"
 *                 channelCount:
 *                   type: integer
 *                   description: Total number of channels in the guild
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 */
router.get('/:id', requireGuildAdmin, validateGuild, (req, res) => {
  const guild = req.guild;
  res.json({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    channels: getGuildChannels(guild),
  });
});

/**
 * @openapi
 * /guilds/{id}/channels:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: List guild channels
 *     description: Returns all channels in the guild (capped at 500).
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Channel list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   type:
 *                     type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 */
router.get('/:id/channels', requireGuildAdmin, validateGuild, (req, res) => {
  res.json(getGuildChannels(req.guild));
});

/**
 * @openapi
 * /guilds/{id}/roles:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: List guild roles
 *     description: Returns all roles in the guild (capped at 250).
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Role list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   color:
 *                     type: integer
 *                     description: Role color as decimal integer (for example 16711680)
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 */
router.get('/:id/roles', requireGuildAdmin, validateGuild, (req, res) => {
  const guild = req.guild;
  const roles = Array.from(guild.roles.cache.values())
    .filter((r) => r.id !== guild.id) // exclude @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color }))
    .slice(0, MAX_ROLES);
  res.json(roles);
});

/**
 * @openapi
 * /guilds/{id}/config:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: Get guild config
 *     description: Returns per-guild configuration (global defaults merged with guild overrides). Sensitive fields are masked.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Guild config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 */
router.get('/:id/config', requireGuildAdmin, validateGuild, (req, res) => {
  const config = getConfig(req.params.id);
  const safeConfig = {};
  for (const key of READABLE_CONFIG_KEYS) {
    if (key in config) {
      safeConfig[key] = config[key];
    }
  }
  res.json({
    guildId: req.params.id,
    ...maskSensitiveFields(safeConfig),
  });
});

/**
 * @openapi
 * /guilds/{id}/config:
 *   patch:
 *     tags:
 *       - Guilds
 *     summary: Update guild config
 *     description: Updates per-guild configuration overrides. Only writable sections are accepted.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       "200":
 *         description: Updated guild config section
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       "400":
 *         description: Invalid config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ValidationError"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.patch('/:id/config', requireGuildAdmin, validateGuild, async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required' });
  }

  const result = validateConfigPatchBody(req.body, SAFE_CONFIG_KEYS);
  if (result.error) {
    const response = { error: result.error };
    if (result.details) response.details = result.details;
    return res.status(result.status).json(response);
  }

  const { path, value, topLevelKey } = result;

  try {
    await setConfigValue(path, value, req.params.id);
    const effectiveConfig = getConfig(req.params.id);
    const effectiveSection = effectiveConfig[topLevelKey] || {};
    const sensitivePattern = /key|secret|token|password/i;
    const logValue = sensitivePattern.test(path) ? '[REDACTED]' : value;
    info('Config updated via API', { path, value: logValue, guild: req.params.id });
    fireAndForgetWebhook('DASHBOARD_WEBHOOK_URL', {
      event: 'config.updated',
      guildId: req.params.id,
      section: topLevelKey,
      updatedKeys: [path],
      timestamp: Date.now(),
    });
    res.json(effectiveSection);
  } catch (err) {
    error('Failed to update config via API', { path, error: err.message });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * @openapi
 * /guilds/{id}/stats:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: Guild statistics
 *     description: Returns aggregate guild statistics — member count, AI conversations, moderation cases, and uptime.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Guild stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 guildId:
 *                   type: string
 *                 memberCount:
 *                   type: integer
 *                 aiConversations:
 *                   type: integer
 *                   description: Total AI conversations logged for this guild
 *                 moderationCases:
 *                   type: integer
 *                   description: Total moderation cases for this guild
 *                 uptime:
 *                   type: number
 *                   description: Bot process uptime in seconds
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/:id/stats', requireGuildAdmin, validateGuild, async (req, res) => {
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
 * @openapi
 * /guilds/{id}/analytics:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: Guild analytics
 *     description: Returns time-series analytics data for dashboard charts — messages, joins/leaves, active members, AI usage, XP distribution, and more.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [today, week, month, custom]
 *           default: week
 *         description: Preset time range. Use 'custom' with from/to for a specific window.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of custom date range (ISO 8601). Required when range=custom.
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of custom date range (ISO 8601). Required when range=custom.
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [hour, day]
 *         description: Bucket size for time-series data. Auto-selected if omitted.
 *       - in: query
 *         name: compare
 *         schema:
 *           type: string
 *           enum: ["1", "true", "yes", "on"]
 *         description: When set, includes comparison data for the previous equivalent period.
 *       - in: query
 *         name: channelId
 *         schema:
 *           type: string
 *         description: Optional filter by channel ID
 *     responses:
 *       "200":
 *         description: Analytics dataset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       "400":
 *         description: Invalid analytics query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/:id/analytics', requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;

  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  let rangeConfig;
  try {
    rangeConfig = parseAnalyticsRange(req.query);
  } catch (err) {
    if (err instanceof AnalyticsRangeValidationError) {
      return res.status(400).json({ error: err.message });
    }

    warn('Unexpected analytics range parsing error', {
      guild: req.params.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(400).json({ error: 'Invalid range parameter' });
  }

  const { from, to, range } = rangeConfig;
  const interval = parseAnalyticsInterval(req.query, from, to);
  const compareMode = parseComparisonMode(req.query);

  const rangeDurationMs = to.getTime() - from.getTime();
  const comparisonFrom = compareMode ? new Date(from.getTime() - rangeDurationMs) : null;
  const comparisonTo = compareMode ? new Date(to.getTime() - rangeDurationMs) : null;

  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId.trim() : '';
  const activeChannelFilter = channelId.length > 0 ? channelId : null;

  const conversationWhereParts = ['guild_id = $1', 'created_at >= $2', 'created_at <= $3'];
  const conversationValues = [req.params.id, from.toISOString(), to.toISOString()];

  if (activeChannelFilter) {
    conversationValues.push(activeChannelFilter);
    conversationWhereParts.push(`channel_id = $${conversationValues.length}`);
  }

  const conversationWhere = conversationWhereParts.join(' AND ');

  const comparisonConversationValues =
    comparisonFrom && comparisonTo
      ? [req.params.id, comparisonFrom.toISOString(), comparisonTo.toISOString()]
      : null;
  const comparisonConversationWhereParts = comparisonConversationValues
    ? ['guild_id = $1', 'created_at >= $2', 'created_at <= $3']
    : [];

  if (activeChannelFilter && comparisonConversationValues && comparisonConversationWhereParts) {
    comparisonConversationValues.push(activeChannelFilter);
    comparisonConversationWhereParts.push(`channel_id = $${comparisonConversationValues.length}`);
  }

  const comparisonConversationWhere = comparisonConversationWhereParts.join(' AND ');

  const ALLOWED_INTERVALS = new Set(['hour', 'day']);
  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({ error: 'Invalid interval parameter' });
  }
  const bucketExpr =
    interval === 'hour' ? "date_trunc('hour', created_at)" : "date_trunc('day', created_at)";

  const logsWhereParts = [
    "message = 'AI usage'",
    "metadata->>'guildId' = $1",
    'timestamp >= $2',
    'timestamp <= $3',
  ];
  const logsValues = [req.params.id, from.toISOString(), to.toISOString()];

  if (activeChannelFilter) {
    logsValues.push(activeChannelFilter);
    logsWhereParts.push(`metadata->>'channelId' = $${logsValues.length}`);
  }

  const logsWhere = logsWhereParts.join(' AND ');

  const comparisonLogsValues =
    comparisonFrom && comparisonTo
      ? [req.params.id, comparisonFrom.toISOString(), comparisonTo.toISOString()]
      : null;
  const comparisonLogsWhereParts = comparisonLogsValues
    ? ["message = 'AI usage'", "metadata->>'guildId' = $1", 'timestamp >= $2', 'timestamp <= $3']
    : [];

  if (activeChannelFilter && comparisonLogsValues && comparisonLogsWhereParts) {
    comparisonLogsValues.push(activeChannelFilter);
    comparisonLogsWhereParts.push(`metadata->>'channelId' = $${comparisonLogsValues.length}`);
  }

  const comparisonLogsWhere = comparisonLogsWhereParts.join(' AND ');

  const commandUsageValues = [req.params.id, from.toISOString(), to.toISOString()];
  const commandUsageWhereParts = [
    "message = 'Command executed'",
    "metadata->>'guildId' = $1",
    'timestamp >= $2',
    'timestamp <= $3',
  ];

  if (activeChannelFilter) {
    commandUsageValues.push(activeChannelFilter);
    commandUsageWhereParts.push(`metadata->>'channelId' = $${commandUsageValues.length}`);
  }

  const commandUsageWhere = commandUsageWhereParts.join(' AND ');

  try {
    const [
      kpiResult,
      comparisonKpiResult,
      volumeResult,
      channelResult,
      heatmapResult,
      activeResult,
      modelUsageResult,
      comparisonCostResult,
      commandUsageResult,
    ] = await Promise.all([
      dbPool.query(
        `SELECT
             COUNT(*)::int AS total_messages,
             COUNT(*) FILTER (WHERE role = 'assistant')::int AS ai_requests,
             COUNT(DISTINCT CASE WHEN role = 'user' THEN username END)::int AS active_users
           FROM conversations
           WHERE ${conversationWhere}`,
        conversationValues,
      ),
      comparisonConversationValues
        ? dbPool.query(
            `SELECT
                 COUNT(*)::int AS total_messages,
                 COUNT(*) FILTER (WHERE role = 'assistant')::int AS ai_requests,
                 COUNT(DISTINCT CASE WHEN role = 'user' THEN username END)::int AS active_users
               FROM conversations
               WHERE ${comparisonConversationWhere}`,
            comparisonConversationValues,
          )
        : Promise.resolve({ rows: [] }),
      dbPool.query(
        `SELECT
             ${bucketExpr} AS bucket,
             COUNT(*)::int AS messages,
             COUNT(*) FILTER (WHERE role = 'assistant')::int AS ai_requests
           FROM conversations
           WHERE ${conversationWhere}
           GROUP BY 1
           ORDER BY 1 ASC`,
        conversationValues,
      ),
      dbPool.query(
        `SELECT channel_id, COUNT(*)::int AS messages
           FROM conversations
           WHERE ${conversationWhere}
           GROUP BY channel_id
           ORDER BY messages DESC
           LIMIT 10`,
        conversationValues,
      ),
      dbPool.query(
        `SELECT
             EXTRACT(DOW FROM created_at)::int AS day_of_week,
             EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
             COUNT(*)::int AS messages
           FROM conversations
           WHERE ${conversationWhere}
           GROUP BY 1, 2
           ORDER BY 1 ASC, 2 ASC`,
        conversationValues,
      ),
      // Active AI conversations - filter by channel if specified
      activeChannelFilter
        ? dbPool.query(
            `SELECT COUNT(DISTINCT channel_id)::int AS count
               FROM conversations
               WHERE guild_id = $1
                 AND channel_id = $2
                 AND role = 'assistant'
                 AND created_at >= NOW() - make_interval(mins => $3)`,
            [req.params.id, activeChannelFilter, ACTIVE_CONVERSATION_WINDOW_MINUTES],
          )
        : dbPool.query(
            `SELECT COUNT(DISTINCT channel_id)::int AS count
               FROM conversations
               WHERE guild_id = $1
                 AND role = 'assistant'
                 AND created_at >= NOW() - make_interval(mins => $2)`,
            [req.params.id, ACTIVE_CONVERSATION_WINDOW_MINUTES],
          ),
      dbPool
        .query(
          `SELECT
               COALESCE(NULLIF(metadata->>'model', ''), 'unknown') AS model,
               COUNT(*)::bigint AS requests,
               SUM(
                 CASE
                   WHEN (metadata->>'promptTokens') ~ '^[0-9]+$'
                   THEN (metadata->>'promptTokens')::int
                   ELSE 0
                 END
               )::bigint AS prompt_tokens,
               SUM(
                 CASE
                   WHEN (metadata->>'completionTokens') ~ '^[0-9]+$'
                   THEN (metadata->>'completionTokens')::int
                   ELSE 0
                 END
               )::bigint AS completion_tokens,
               SUM(
                 CASE
                   WHEN (metadata->>'estimatedCostUsd') ~ '^[0-9]+(\\.[0-9]+)?$'
                   THEN (metadata->>'estimatedCostUsd')::numeric
                   ELSE 0
                 END
               ) AS cost_usd
             FROM logs
             WHERE ${logsWhere}
             GROUP BY 1
             ORDER BY requests DESC`,
          logsValues,
        )
        .catch((err) => {
          warn('Analytics logs query failed; returning empty AI usage dataset', {
            guild: req.params.id,
            error: err.message,
          });
          return { rows: [] };
        }),
      comparisonLogsValues
        ? dbPool
            .query(
              `SELECT
                   SUM(
                     CASE
                       WHEN (metadata->>'estimatedCostUsd') ~ '^[0-9]+(\\.[0-9]+)?$'
                       THEN (metadata->>'estimatedCostUsd')::numeric
                       ELSE 0
                     END
                   ) AS cost_usd
                 FROM logs
                 WHERE ${comparisonLogsWhere}`,
              comparisonLogsValues,
            )
            .catch((err) => {
              warn('Comparison AI usage query failed; defaulting previous AI cost to 0', {
                guild: req.params.id,
                error: err.message,
              });
              return { rows: [] };
            })
        : Promise.resolve({ rows: [] }),
      dbPool
        .query(
          `SELECT
               COALESCE(NULLIF(metadata->>'command', ''), 'unknown') AS command_name,
               COUNT(*)::int AS uses
             FROM logs
             WHERE ${commandUsageWhere}
             GROUP BY 1
             ORDER BY uses DESC, command_name ASC
             LIMIT 15`,
          commandUsageValues,
        )
        .then((result) => ({ rows: result.rows, available: true }))
        .catch((err) => {
          // TODO(issue-122): move slash-command analytics to a dedicated usage table
          // so dashboard metrics are not coupled to log transport availability.
          warn('Command usage query failed; returning empty command usage dataset', {
            guild: req.params.id,
            error: err.message,
          });
          return { rows: [], available: false };
        }),
    ]);

    const kpiRow = kpiResult.rows[0] || {
      total_messages: 0,
      ai_requests: 0,
      active_users: 0,
    };

    const comparisonKpiRow = comparisonKpiResult.rows[0] || {
      total_messages: 0,
      ai_requests: 0,
      active_users: 0,
    };

    const volume = volumeResult.rows.map((row) => {
      const bucketDate = new Date(row.bucket);
      return {
        bucket: bucketDate.toISOString(),
        label: formatBucketLabel(bucketDate, interval),
        messages: Number(row.messages || 0),
        aiRequests: Number(row.ai_requests || 0),
      };
    });

    const channelActivity = channelResult.rows.map((row) => {
      const channelName = req.guild.channels.cache.get(row.channel_id)?.name || row.channel_id;
      return {
        channelId: row.channel_id,
        name: channelName,
        messages: Number(row.messages || 0),
      };
    });

    const heatmap = heatmapResult.rows.map((row) => ({
      dayOfWeek: Number(row.day_of_week || 0),
      hour: Number(row.hour_of_day || 0),
      messages: Number(row.messages || 0),
    }));

    const usageByModel = modelUsageResult.rows.map((row) => ({
      model: row.model,
      requests: Number(row.requests || 0),
      promptTokens: Number(row.prompt_tokens || 0),
      completionTokens: Number(row.completion_tokens || 0),
      costUsd: Number(row.cost_usd || 0),
    }));

    const promptTokenTotal = usageByModel.reduce((sum, model) => sum + model.promptTokens, 0);
    const completionTokenTotal = usageByModel.reduce(
      (sum, model) => sum + model.completionTokens,
      0,
    );
    const aiCostUsd = usageByModel.reduce((sum, model) => sum + model.costUsd, 0);
    const comparisonAiCostUsd = Number(comparisonCostResult.rows[0]?.cost_usd || 0);

    const commandUsage = commandUsageResult.rows.map((row) => ({
      command: row.command_name,
      uses: Number(row.uses || 0),
    }));

    const fromMs = from.getTime();
    const toMs = to.getTime();
    /**
     * NOTE: guild.members.cache only contains members Discord has sent to the
     * bot (typically those with recent activity/presence). Both newMembers and
     * onlineMemberCount will undercount relative to the true guild population.
     * This is a known Discord gateway limitation — a complete count would
     * require guild.members.fetch(), which is expensive and rate-limited.
     */
    const newMembers = Array.from(req.guild.members.cache.values()).reduce((count, member) => {
      if (member.user?.bot) return count;
      const joinedAt = member.joinedTimestamp;
      if (!joinedAt) return count;
      return joinedAt >= fromMs && joinedAt <= toMs ? count + 1 : count;
    }, 0);

    const comparisonFromMs = comparisonFrom?.getTime() ?? null;
    const comparisonToMs = comparisonTo?.getTime() ?? null;
    const comparisonNewMembers =
      comparisonFromMs !== null && comparisonToMs !== null
        ? Array.from(req.guild.members.cache.values()).reduce((count, member) => {
            if (member.user?.bot) return count;
            const joinedAt = member.joinedTimestamp;
            if (!joinedAt) return count;
            return joinedAt >= comparisonFromMs && joinedAt <= comparisonToMs ? count + 1 : count;
          }, 0)
        : 0;

    let onlineMemberCount = 0;
    let membersWithPresence = 0;
    // Same cache limitation as above — only evaluates cached members with known presence.
    for (const member of req.guild.members.cache.values()) {
      const status = member.presence?.status;
      if (!status) continue;
      membersWithPresence++;
      if (status !== 'offline') onlineMemberCount++;
    }

    return res.json({
      guildId: req.params.id,
      range: {
        type: range,
        from: from.toISOString(),
        to: to.toISOString(),
        interval,
        channelId: activeChannelFilter,
        compare: compareMode,
      },
      kpis: {
        totalMessages: Number(kpiRow.total_messages || 0),
        aiRequests: Number(kpiRow.ai_requests || 0),
        aiCostUsd: Number(aiCostUsd.toFixed(6)),
        activeUsers: Number(kpiRow.active_users || 0),
        newMembers,
      },
      realtime: {
        onlineMembers: membersWithPresence > 0 ? onlineMemberCount : null,
        activeAiConversations: Number(activeResult.rows[0]?.count || 0),
      },
      messageVolume: volume,
      aiUsage: {
        byModel: usageByModel,
        tokens: {
          prompt: promptTokenTotal,
          completion: completionTokenTotal,
        },
      },
      channelActivity,
      topChannels: channelActivity,
      commandUsage: {
        source: commandUsageResult.available ? 'logs' : 'unavailable',
        items: commandUsage,
      },
      comparison: compareMode
        ? {
            previousRange: {
              from: comparisonFrom.toISOString(),
              to: comparisonTo.toISOString(),
            },
            kpis: {
              totalMessages: Number(comparisonKpiRow.total_messages || 0),
              aiRequests: Number(comparisonKpiRow.ai_requests || 0),
              aiCostUsd: Number(comparisonAiCostUsd.toFixed(6)),
              activeUsers: Number(comparisonKpiRow.active_users || 0),
              newMembers: comparisonNewMembers,
            },
          }
        : null,
      heatmap,
    });
  } catch (err) {
    error('Failed to fetch analytics', {
      error: err.message,
      guild: req.params.id,
      from: from.toISOString(),
      to: to.toISOString(),
      interval,
      channelId: activeChannelFilter,
    });
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * @openapi
 * /guilds/{id}/moderation:
 *   get:
 *     tags:
 *       - Guilds
 *     summary: Recent moderation cases
 *     description: Returns recent moderation cases for the guild overview. Requires moderator permissions.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *           maximum: 100
 *     responses:
 *       "200":
 *         description: Moderation cases
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cases:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/:id/moderation', requireGuildModerator, validateGuild, async (req, res) => {
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
 * @openapi
 * /guilds/{id}/actions:
 *   post:
 *     tags:
 *       - Guilds
 *     summary: Trigger guild action
 *     description: >
 *       Trigger a bot action on a guild. Supported actions: sendMessage (post a text message
 *       to a channel). Restricted to API-secret authentication only.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 description: The action to perform
 *     responses:
 *       "201":
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 channelId:
 *                   type: string
 *                 content:
 *                   type: string
 *       "400":
 *         description: Unknown action
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.post('/:id/actions', requireGuildAdmin, validateGuild, async (req, res) => {
  if (req.authMethod !== 'api-secret') {
    return res.status(403).json({ error: 'Actions endpoint requires API secret authentication' });
  }

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
