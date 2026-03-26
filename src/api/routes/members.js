/**
 * Member Management Routes
 * Enhanced member endpoints with bot data enrichment (stats, XP, moderation).
 *
 * Mounted at /api/v1/guilds — all routes prefixed with /:id/members.
 */

import { Router } from 'express';
import { getPool } from '../../db.js';
import { info, error as logError } from '../../logger.js';
import { getConfig } from '../../modules/config.js';
import { computeLevel } from '../../modules/reputation.js';
import { XP_DEFAULTS } from '../../modules/xpDefaults.js';
import { cacheGet, cacheSet, TTL } from '../../utils/cache.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { parseLimit, parsePage } from '../utils/pagination.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router();

/** Rate limiter for member endpoints — 120 requests / 15 min per IP. */
const membersRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

/**
 * Resolve the XP config for a guild, merging defaults.
 * @param {string} guildId - Guild identifier used to load the guild's configuration.
 * @returns {object} The XP configuration with guild-specific values overriding defaults.
 */
function getXpConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...XP_DEFAULTS, ...cfg.xp };
}

/**
 * Obtain the PostgreSQL connection pool instance for the application.
 *
 * Returns the active `pg` Pool when available; returns `null` if the pool cannot be retrieved.
 * @returns {import('pg').Pool | null} Database pool if available, `null` otherwise.
 */
function safeGetPool() {
  try {
    return getPool();
  } catch {
    return null;
  }
}

// ─── GET /:id/members/export — CSV export (must be before /:userId) ──────────

/**
 * @openapi
 * /guilds/{id}/members/export:
 *   get:
 *     tags:
 *       - Members
 *     summary: Export members as CSV
 *     description: Streams a CSV file with enriched member data (stats, XP, warnings). May take a while for large guilds.
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
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/:id/members/export',
  membersRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    try {
      const guild = req.guild;
      const pool = safeGetPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      // Stream CSV in batches of 1000 to avoid holding all guild members in
      // memory at once.  Each batch is fetched from Discord, enriched from the
      // DB, written to the response, and then released for GC.
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
      res.write('userId,username,displayName,joinedAt,messages,xp,level,daysActive,warnings\n');

      let lastId;
      let exportedCount = 0;
      while (true) {
        const fetchOpts = { limit: 1000 };
        if (lastId) fetchOpts.after = lastId;
        const batch = await guild.members.list(fetchOpts);
        if (batch.size === 0) break;

        const batchMembers = Array.from(batch.values());
        const userIds = batchMembers.map((m) => m.id);

        // Enrich this batch from the DB
        const [statsResult, repResult, warningsResult] = await Promise.all([
          pool.query(
            `SELECT user_id, messages_sent, days_active, last_active
               FROM user_stats
               WHERE guild_id = $1 AND user_id = ANY($2)`,
            [guild.id, userIds],
          ),
          pool.query(
            `SELECT user_id, xp, level
               FROM reputation
               WHERE guild_id = $1 AND user_id = ANY($2)`,
            [guild.id, userIds],
          ),
          pool.query(
            `SELECT target_id, COUNT(*)::integer AS count
               FROM mod_cases
               WHERE guild_id = $1 AND target_id = ANY($2) AND action = 'warn'
               GROUP BY target_id`,
            [guild.id, userIds],
          ),
        ]);

        const statsMap = new Map(statsResult.rows.map((r) => [r.user_id, r]));
        const repMap = new Map(repResult.rows.map((r) => [r.user_id, r]));
        const warningsMap = new Map(warningsResult.rows.map((r) => [r.target_id, r.count]));

        // Write CSV rows for this batch, then let maps/arrays become GC-eligible
        for (const member of batchMembers) {
          const stats = statsMap.get(member.id) || {};
          const rep = repMap.get(member.id) || {};
          const warnings = warningsMap.get(member.id) || 0;

          const row = [
            member.id,
            escapeCsv(member.user.username),
            escapeCsv(member.displayName),
            member.joinedAt ? member.joinedAt.toISOString() : '',
            stats.messages_sent ?? 0,
            rep.xp ?? 0,
            rep.level ?? 0,
            stats.days_active ?? 0,
            warnings,
          ].join(',');

          res.write(`${row}\n`);
        }

        lastId = Array.from(batch.keys()).pop();
        exportedCount += batch.size;
        if (batch.size < 1000) break;
      }

      res.end();
      info('Members CSV exported', { guildId: guild.id, count: exportedCount });
    } catch (err) {
      logError('Failed to export members CSV', { error: err.message, guild: req.params.id });
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export members' });
      }
    }
  },
);

// ─── GET /:id/members — Enhanced member list ─────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/members:
 *   get:
 *     tags:
 *       - Members
 *     summary: List members
 *     description: Returns enriched member list with stats, XP, and warning counts. Supports search, sort, and cursor-based pagination.
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *         description: Cursor for Discord pagination (member ID)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username or display name
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [messages, xp, warnings, joined]
 *           default: joined
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       "200":
 *         description: Enriched member list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 members:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       avatar:
 *                         type: string
 *                       roles:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                       joinedAt:
 *                         type: string
 *                         format: date-time
 *                       messages_sent:
 *                         type: integer
 *                       days_active:
 *                         type: integer
 *                       last_active:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       xp:
 *                         type: integer
 *                       level:
 *                         type: integer
 *                       warning_count:
 *                         type: integer
 *                 nextAfter:
 *                   type: string
 *                   nullable: true
 *                   description: Cursor for next page
 *                 total:
 *                   type: integer
 *                   description: Total guild member count
 *                 filteredTotal:
 *                   type: integer
 *                   description: Only present when search is active
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/:id/members', membersRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const after = req.query.after || undefined;
  const search = req.query.search || undefined;
  const sort = req.query.sort || 'joined';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';

  try {
    const guild = req.guild;
    const pool = safeGetPool();
    if (!pool) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Fetch members — use Discord server-side search when a query is provided
    // (searches all guild members by username/nickname prefix), otherwise use
    // cursor-based listing.  Sort is applied after enrichment and is scoped to
    // the returned page; it does NOT globally sort all guild members.
    //
    // TODO: Server-side member search accuracy — Discord's guild.members.search()
    // only searches the bot's in-memory member cache (populated by the GUILD_MEMBERS
    // privileged intent). For large guilds (100k+ members) the cache is incomplete.
    // For full coverage, consider: (a) adding a members DB table populated from
    // guildMemberAdd events + bulk sync on startup, or (b) using the Discord HTTP
    // API directly with the Search Guild Members endpoint which searches all members.
    let memberList;
    let paginationCursor = null;
    if (search) {
      const searchResults = await guild.members.search({ query: search, limit });
      memberList = Array.from(searchResults.values());
      // Discord search does not support cursor pagination
    } else {
      const fetchOptions = { limit, after };
      const discordPage = await guild.members.list(fetchOptions);
      memberList = Array.from(discordPage.values());
      const lastMember = Array.from(discordPage.values()).pop();
      paginationCursor = lastMember ? lastMember.id : null;
    }

    const userIds = memberList.map((m) => m.id);

    // Try to load per-user enrichment data from cache first, then batch-fetch DB for misses.
    // Cache key per user: `member:enrichment:{guildId}:{userId}` — TTL.MEMBERS (60 s).
    const enrichmentCacheKeys = userIds.map((id) => `member:enrichment:${guild.id}:${id}`);
    const cachedEnrichments = await Promise.all(enrichmentCacheKeys.map((k) => cacheGet(k)));

    // Determine which users still need DB enrichment
    const uncachedUserIds = userIds.filter((_, i) => cachedEnrichments[i] === null);

    let statsRows = [];
    let repRows = [];
    let warningsRows = [];

    if (uncachedUserIds.length > 0) {
      // Batch-fetch enrichment data only for cache-miss users
      const [statsResult, repResult, warningsResult] = await Promise.all([
        pool.query(
          `SELECT user_id, messages_sent, days_active, last_active
               FROM user_stats
               WHERE guild_id = $1 AND user_id = ANY($2)`,
          [guild.id, uncachedUserIds],
        ),
        pool.query(
          `SELECT user_id, xp, level
               FROM reputation
               WHERE guild_id = $1 AND user_id = ANY($2)`,
          [guild.id, uncachedUserIds],
        ),
        pool.query(
          `SELECT target_id, COUNT(*)::integer AS count
               FROM mod_cases
               WHERE guild_id = $1 AND target_id = ANY($2) AND action = 'warn'
               GROUP BY target_id`,
          [guild.id, uncachedUserIds],
        ),
      ]);
      statsRows = statsResult.rows;
      repRows = repResult.rows;
      warningsRows = warningsResult.rows;
    }

    const statsMap = new Map(statsRows.map((r) => [r.user_id, r]));
    const repMap = new Map(repRows.map((r) => [r.user_id, r]));
    const warningsMap = new Map(warningsRows.map((r) => [r.target_id, r.count]));

    // Persist freshly-fetched enrichment data to cache (fire-and-forget)
    const cacheWrites = [];
    for (let i = 0; i < userIds.length; i++) {
      if (cachedEnrichments[i] !== null) continue; // already cached
      const userId = userIds[i];
      const stats = statsMap.get(userId) || {};
      const rep = repMap.get(userId) || {};
      const warnings = warningsMap.get(userId) || 0;
      const enrichment = {
        messages_sent: stats.messages_sent ?? 0,
        days_active: stats.days_active ?? 0,
        last_active: stats.last_active ?? null,
        xp: rep.xp ?? 0,
        level: rep.level ?? 0,
        warning_count: warnings,
      };
      cacheWrites.push(cacheSet(enrichmentCacheKeys[i], enrichment, TTL.MEMBERS).catch(() => {}));
    }
    // Write to cache without blocking the response
    Promise.all(cacheWrites).catch(() => {});

    // Build enriched member objects by merging Discord data with enrichment (cache or DB)
    const enriched = memberList.map((m, i) => {
      const enrichment = cachedEnrichments[i] ?? {
        messages_sent: statsMap.get(m.id)?.messages_sent ?? 0,
        days_active: statsMap.get(m.id)?.days_active ?? 0,
        last_active: statsMap.get(m.id)?.last_active ?? null,
        xp: repMap.get(m.id)?.xp ?? 0,
        level: repMap.get(m.id)?.level ?? 0,
        warning_count: warningsMap.get(m.id) ?? 0,
      };

      return {
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL(),
        roles: Array.from(m.roles.cache.values()).map((r) => ({ id: r.id, name: r.name })),
        joinedAt: m.joinedAt,
        messages_sent: enrichment.messages_sent,
        days_active: enrichment.days_active,
        last_active: enrichment.last_active,
        xp: enrichment.xp,
        level: enrichment.level,
        warning_count: enrichment.warning_count,
      };
    });

    // Sort
    const validSorts = ['messages', 'xp', 'warnings', 'joined'];
    if (validSorts.includes(sort)) {
      enriched.sort((a, b) => {
        let aVal, bVal;
        switch (sort) {
          case 'messages':
            aVal = a.messages_sent;
            bVal = b.messages_sent;
            break;
          case 'xp':
            aVal = a.xp;
            bVal = b.xp;
            break;
          case 'warnings':
            aVal = a.warning_count;
            bVal = b.warning_count;
            break;
          case 'joined':
            aVal = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            bVal = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            break;
        }
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    const response = {
      members: enriched,
      nextAfter: paginationCursor,
      total: guild.memberCount,
    };
    // When search is active, include filtered count so the UI can show accurate
    // totals.  Because Discord search caps results at `limit`, the count may be
    // truncated for very broad queries.
    if (search) {
      response.filteredTotal = enriched.length;
    }
    res.json(response);
  } catch (err) {
    logError('Failed to fetch enriched members', { error: err.message, guild: req.params.id });
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ─── GET /:id/members/:userId — Member detail ────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/members/{userId}:
 *   get:
 *     tags:
 *       - Members
 *     summary: Get member detail
 *     description: Returns full member profile including stats, XP, level progression, roles, and recent warnings.
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
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord user ID
 *     responses:
 *       "200":
 *         description: Member detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 displayName:
 *                   type: string
 *                 avatar:
 *                   type: string
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       color:
 *                         type: string
 *                 joinedAt:
 *                   type: string
 *                   format: date-time
 *                 stats:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     messages_sent:
 *                       type: integer
 *                     reactions_given:
 *                       type: integer
 *                     reactions_received:
 *                       type: integer
 *                     days_active:
 *                       type: integer
 *                     first_seen:
 *                       type: string
 *                       format: date-time
 *                     last_active:
 *                       type: string
 *                       format: date-time
 *                 reputation:
 *                   type: object
 *                   properties:
 *                     xp:
 *                       type: integer
 *                     level:
 *                       type: integer
 *                     messages_count:
 *                       type: integer
 *                     voice_minutes:
 *                       type: integer
 *                     helps_given:
 *                       type: integer
 *                     last_xp_gain:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     next_level_xp:
 *                       type: integer
 *                       nullable: true
 *                 warnings:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     recent:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           case_number:
 *                             type: integer
 *                           action:
 *                             type: string
 *                           reason:
 *                             type: string
 *                           moderator_tag:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/:id/members/:userId',
  membersRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { userId } = req.params;

    try {
      const guild = req.guild;
      const pool = safeGetPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      // Fetch Discord member
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        return res.status(404).json({ error: 'Member not found in guild' });
      }

      // Fetch all enrichment data in parallel
      const [statsResult, repResult, warningCountResult, recentWarningsResult] = await Promise.all([
        pool.query(
          `SELECT messages_sent, reactions_given, reactions_received, days_active, first_seen, last_active
           FROM user_stats
           WHERE guild_id = $1 AND user_id = $2`,
          [guild.id, userId],
        ),
        pool.query(
          `SELECT xp, level, messages_count, voice_minutes, helps_given, last_xp_gain
           FROM reputation
           WHERE guild_id = $1 AND user_id = $2`,
          [guild.id, userId],
        ),
        pool.query(
          `SELECT COUNT(*)::integer AS count
           FROM mod_cases
           WHERE guild_id = $1 AND target_id = $2 AND action = 'warn'`,
          [guild.id, userId],
        ),
        pool.query(
          `SELECT case_number, action, reason, moderator_tag, created_at
           FROM mod_cases
           WHERE guild_id = $1 AND target_id = $2 AND action = 'warn'
           ORDER BY created_at DESC
           LIMIT 5`,
          [guild.id, userId],
        ),
      ]);

      const stats = statsResult.rows[0] || null;
      const rep = repResult.rows[0] || null;
      const warningCount = warningCountResult.rows[0]?.count ?? 0;

      // Compute badge/level info
      const xpConfig = getXpConfig(guild.id);
      const xp = rep?.xp ?? 0;
      // Recompute level from XP instead of trusting reputation.level (stale after threshold changes)
      const level = computeLevel(xp, xpConfig.levelThresholds);
      const nextThreshold = xpConfig.levelThresholds[level] ?? null;

      res.json({
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL(),
        roles: Array.from(member.roles.cache.values()).map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
        })),
        joinedAt: member.joinedAt,
        stats: stats
          ? {
              messages_sent: stats.messages_sent,
              reactions_given: stats.reactions_given,
              reactions_received: stats.reactions_received,
              days_active: stats.days_active,
              first_seen: stats.first_seen,
              last_active: stats.last_active,
            }
          : null,
        reputation: {
          xp,
          level,
          messages_count: rep?.messages_count ?? 0,
          voice_minutes: rep?.voice_minutes ?? 0,
          helps_given: rep?.helps_given ?? 0,
          last_xp_gain: rep?.last_xp_gain ?? null,
          next_level_xp: nextThreshold,
        },
        warnings: {
          count: warningCount,
          recent: recentWarningsResult.rows,
        },
      });
    } catch (err) {
      logError('Failed to fetch member detail', {
        error: err.message,
        guild: req.params.id,
        userId: req.params.userId,
      });
      res.status(500).json({ error: 'Failed to fetch member details' });
    }
  },
);

// ─── GET /:id/members/:userId/cases — Full moderation history ─────────────────

/**
 * @openapi
 * /guilds/{id}/members/{userId}/cases:
 *   get:
 *     tags:
 *       - Members
 *     summary: Member mod case history
 *     description: Returns paginated moderation case history for a specific member.
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
 *       - in: path
 *         name: userId
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
 *         description: Member case history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 cases:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       case_number:
 *                         type: integer
 *                       action:
 *                         type: string
 *                       reason:
 *                         type: string
 *                         nullable: true
 *                       moderator_id:
 *                         type: string
 *                       moderator_tag:
 *                         type: string
 *                       duration:
 *                         type: string
 *                         nullable: true
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/:id/members/:userId/cases',
  membersRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { userId } = req.params;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;

    try {
      const pool = safeGetPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const [casesResult, countResult] = await Promise.all([
        pool.query(
          `SELECT case_number, action, reason, moderator_id, moderator_tag, duration, expires_at, created_at
           FROM mod_cases
           WHERE guild_id = $1 AND target_id = $2
           ORDER BY created_at DESC
           LIMIT $3 OFFSET $4`,
          [req.guild.id, userId, limit, offset],
        ),
        pool.query(
          `SELECT COUNT(*)::integer AS total
           FROM mod_cases
           WHERE guild_id = $1 AND target_id = $2`,
          [req.guild.id, userId],
        ),
      ]);

      const total = countResult.rows[0]?.total ?? 0;
      const pages = Math.ceil(total / limit) || 1;

      res.json({
        userId,
        cases: casesResult.rows,
        total,
        page,
        pages,
      });
    } catch (err) {
      logError('Failed to fetch member cases', {
        error: err.message,
        guild: req.params.id,
        userId,
      });
      res.status(500).json({ error: 'Failed to fetch member cases' });
    }
  },
);

// ─── POST /:id/members/:userId/xp — Admin XP adjustment ──────────────────────

/**
 * @openapi
 * /guilds/{id}/members/{userId}/xp:
 *   post:
 *     tags:
 *       - Members
 *     summary: Adjust member XP
 *     description: Add or remove XP for a member. XP floors at 0. Amount must be a non-zero integer between -1,000,000 and 1,000,000.
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
 *       - in: path
 *         name: userId
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
 *               - amount
 *             properties:
 *               amount:
 *                 type: integer
 *                 description: XP adjustment (positive or negative, max ±1,000,000)
 *               reason:
 *                 type: string
 *                 description: Optional reason for the adjustment
 *     responses:
 *       "200":
 *         description: Updated XP/level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 xp:
 *                   type: integer
 *                 level:
 *                   type: integer
 *                 adjustment:
 *                   type: integer
 *                 reason:
 *                   type: string
 *                   nullable: true
 *       "400":
 *         description: Invalid amount
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.post(
  '/:id/members/:userId/xp',
  membersRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { userId } = req.params;
    const { amount, reason } = req.body || {};

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero finite number' });
    }

    if (!Number.isInteger(amount)) {
      return res.status(400).json({ error: 'amount must be an integer' });
    }

    // Cap adjustment to ±1,000,000
    if (Math.abs(amount) > 1_000_000) {
      return res.status(400).json({ error: 'amount must be between -1000000 and 1000000' });
    }

    try {
      const pool = safeGetPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database unavailable' });
      }
      const guildId = req.guild.id;

      // Wrap XP upsert + level update in a transaction for consistency
      const client = await pool.connect();
      let newXp, newLevel, oldLevel;
      try {
        await client.query('BEGIN');

        // Upsert reputation and adjust XP (floor at 0)
        const { rows } = await client.query(
          `INSERT INTO reputation (guild_id, user_id, xp, level)
           VALUES ($1, $2, GREATEST(0, $3), 0)
           ON CONFLICT (guild_id, user_id) DO UPDATE
             SET xp = GREATEST(0, reputation.xp + $3)
           RETURNING xp, level`,
          [guildId, userId, amount],
        );

        newXp = rows[0].xp;
        oldLevel = rows[0].level;

        // Recompute level from thresholds
        const xpConfig = getXpConfig(guildId);
        newLevel = computeLevel(newXp, xpConfig.levelThresholds);

        // Update level if changed
        if (newLevel !== rows[0].level) {
          await client.query(
            'UPDATE reputation SET level = $1 WHERE guild_id = $2 AND user_id = $3',
            [newLevel, guildId, userId],
          );
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // If level dropped and removeOnLevelDown is enabled, revoke roles
      if (amount < 0 && newLevel < oldLevel) {
        const xpConfig = getXpConfig(guildId);
        if (xpConfig.enabled && xpConfig.roleRewards.removeOnLevelDown) {
          try {
            const member = await req.guild.members.fetch(userId);
            const { enforceRoleLevelDown } = await import('../../modules/actions/roleUtils.js');
            await enforceRoleLevelDown(member, newLevel, xpConfig);
          } catch (err) {
            logError('Failed to enforce role level-down', {
              guildId,
              userId,
              newLevel,
              error: err.message,
            });
          }
        }
      }

      info('XP adjusted via API', {
        guildId,
        userId,
        amount,
        reason: reason || null,
        newXp,
        newLevel,
        adjustedBy: req.user?.userId || 'api-secret',
      });

      res.json({
        userId,
        xp: newXp,
        level: newLevel,
        adjustment: amount,
        reason: reason || null,
      });
    } catch (err) {
      logError('Failed to adjust XP', {
        error: err.message,
        guild: req.params.id,
        userId,
      });
      res.status(500).json({ error: 'Failed to adjust XP' });
    }
  },
);

/**
 * Escape a value for CSV output.
 * Handles commas, quotes, newlines, and formula-injection characters
 * (=, +, -, @, \t, \r) by prefixing with a single quote.
 * @param {string} value
 * @returns {string}
 */
function escapeCsv(value) {
  if (value == null) return '';
  let str = String(value);
  // Prevent CSV formula injection — prefix dangerous leading chars
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (str.length > 0 && formulaChars.includes(str[0])) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default router;
