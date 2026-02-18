/**
 * Guild Routes
 * Endpoints for guild info, config, stats, members, moderation, and actions
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { safeSend } from '../../utils/safeSend.js';
import { fetchUserGuilds } from '../utils/discordApi.js';
import { getSessionToken } from '../utils/sessionStore.js';

const router = Router();

/** Discord ADMINISTRATOR permission flag */
const ADMINISTRATOR_FLAG = 0x8;
/** Discord MANAGE_GUILD permission flag */
const MANAGE_GUILD_FLAG = 0x20;

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

const MAX_ANALYTICS_RANGE_DAYS = 90;
const ACTIVE_CONVERSATION_WINDOW_MINUTES = 15;

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
      throw new Error('Custom range requires valid "from" and "to" query params');
    }
    if (from > to) {
      throw new Error('"from" must be before "to"');
    }

    const maxRangeMs = MAX_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRangeMs) {
      throw new Error(`Custom range cannot exceed ${MAX_ANALYTICS_RANGE_DAYS} days`);
    }

    return { from, to, range: 'custom' };
  }

  const from = new Date(now);
  if (range === 'today') {
    from.setUTCHours(0, 0, 0, 0);
  } else if (range === 'month') {
    from.setDate(from.getDate() - 30);
  } else {
    // Default: week
    from.setDate(from.getDate() - 7);
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
 * Check if an OAuth2 user has the specified permission flags on a guild.
 * Fetches fresh guild list from Discord using the access token from the session store.
 *
 * @param {Object} user - Decoded JWT user payload
 * @param {string} guildId - Guild ID to check
 * @param {number} requiredFlags - Bitmask of required permission flags (bitwise OR match)
 * @returns {Promise<boolean>} True if user has ANY of the required flags (bitwise OR match)
 */
async function hasOAuthGuildPermission(user, guildId, requiredFlags) {
  const accessToken = getSessionToken(user?.userId);
  if (!accessToken) return false;
  const guilds = await fetchUserGuilds(user.userId, accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) return false;
  const permissions = Number(guild.permissions);
  if (Number.isNaN(permissions)) return false;
  return (permissions & requiredFlags) !== 0;
}

/**
 * Check whether the authenticated OAuth2 user is a configured bot owner.
 * Bot owners bypass API guild-level permission checks.
 *
 * @param {Object} user - Decoded JWT user payload
 * @returns {boolean} True if JWT userId is in config.permissions.botOwners
 */
function isOAuthBotOwner(user) {
  const botOwners = getConfig()?.permissions?.botOwners;
  return Array.isArray(botOwners) && botOwners.includes(user?.userId);
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
 * Create middleware that verifies OAuth2 users have the required guild permission.
 * API-secret users and configured bot owners are trusted and pass through.
 *
 * @param {(user: Object, guildId: string) => Promise<boolean>} permissionCheck - Permission check function
 * @param {string} errorMessage - Error message for 403 responses
 * @returns {import('express').RequestHandler}
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
const requireGuildAdmin = requireGuildPermission(
  isOAuthGuildAdmin,
  'You do not have admin access to this guild',
);

/** Middleware: verify OAuth2 users are guild moderators. API-secret users pass through. */
const requireGuildModerator = requireGuildPermission(
  isOAuthGuildModerator,
  'You do not have moderator access to this guild',
);

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

/**
 * GET / — List guilds
 * For OAuth2 users:
 * - bot owners: return all guilds where the bot is present (access = "bot-owner")
 * - non-owners: fetch fresh guilds from Discord and return only guilds where user has
 *   ADMINISTRATOR (access = "admin") or MANAGE_GUILD (access = "moderator"), and bot is present
 * For api-secret users: returns all bot guilds
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

    const accessToken = getSessionToken(req.user?.userId);
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

/**
 * GET /:id — Guild info
 */
router.get('/:id', requireGuildAdmin, validateGuild, (req, res) => {
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
 * Returns per-guild config (global defaults merged with guild overrides).
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
    ...safeConfig,
  });
});

/**
 * PATCH /:id/config — Update a guild-specific config value (safe keys only)
 * Body: { path: "ai.model", value: "claude-3" }
 * Writes to the per-guild config overrides for the requested guild.
 */
router.patch('/:id/config', requireGuildAdmin, validateGuild, async (req, res) => {
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
    await setConfigValue(path, value, req.params.id);
    const effectiveConfig = getConfig(req.params.id);
    const effectiveSection = effectiveConfig[topLevelKey] || {};
    info('Config updated via API', { path, value, guild: req.params.id });
    res.json(effectiveSection);
  } catch (err) {
    error('Failed to update config via API', { path, error: err.message });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * GET /:id/stats — Guild statistics
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
 * GET /:id/analytics — Dashboard analytics dataset
 * Query params:
 *   - range=today|week|month|custom
 *   - from=<ISO date> (required for custom)
 *   - to=<ISO date> (required for custom)
 *   - interval=hour|day (optional; auto-derived when omitted)
 *   - channelId=<Discord channel id> (optional filter)
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
    return res.status(400).json({ error: err.message });
  }

  const { from, to, range } = rangeConfig;
  const interval = parseAnalyticsInterval(req.query, from, to);

  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId.trim() : '';
  const activeChannelFilter = channelId.length > 0 ? channelId : null;

  const conversationWhereParts = ['guild_id = $1', 'created_at >= $2', 'created_at <= $3'];
  const conversationValues = [req.params.id, from.toISOString(), to.toISOString()];

  if (activeChannelFilter) {
    conversationValues.push(activeChannelFilter);
    conversationWhereParts.push(`channel_id = $${conversationValues.length}`);
  }

  const conversationWhere = conversationWhereParts.join(' AND ');
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

  try {
    const [kpiResult, volumeResult, channelResult, heatmapResult, activeResult, modelUsageResult] =
      await Promise.all([
        dbPool.query(
          `SELECT
             COUNT(*)::int AS total_messages,
             COUNT(*) FILTER (WHERE role = 'assistant')::int AS ai_requests,
             COUNT(DISTINCT CASE WHEN role = 'user' THEN username END)::int AS active_users
           FROM conversations
           WHERE ${conversationWhere}`,
          conversationValues,
        ),
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
        dbPool.query(
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
               COUNT(*)::int AS requests,
               SUM(
                 CASE
                   WHEN (metadata->>'promptTokens') ~ '^[0-9]+$'
                   THEN (metadata->>'promptTokens')::int
                   ELSE 0
                 END
               )::int AS prompt_tokens,
               SUM(
                 CASE
                   WHEN (metadata->>'completionTokens') ~ '^[0-9]+$'
                   THEN (metadata->>'completionTokens')::int
                   ELSE 0
                 END
               )::int AS completion_tokens,
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
      ]);

    const kpiRow = kpiResult.rows[0] || {
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
 * GET /:id/members — Cursor-based paginated member list with roles
 * Query params: ?limit=25&after=<userId> (max 100)
 * Uses Discord's cursor-based pagination via guild.members.list().
 */
router.get('/:id/members', requireGuildAdmin, validateGuild, async (req, res) => {
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
 * POST /:id/actions — Execute bot actions
 * Body: { action: "sendMessage", channelId: "...", content: "..." }
 */
router.post('/:id/actions', requireGuildAdmin, validateGuild, async (req, res) => {
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
