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
import { REPUTATION_DEFAULTS } from '../../modules/reputationDefaults.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router();

/** Rate limiter for member endpoints — 120 requests / 15 min per IP. */
const membersRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

/**
 * Resolve the reputation configuration for a guild by returning the defaults overridden by the guild's configured reputation values.
 * @param {string} guildId - Guild identifier used to load the guild's configuration.
 * @returns {object} The resolved reputation configuration containing level thresholds and related reputation settings.
 */
function getRepConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...REPUTATION_DEFAULTS, ...cfg.reputation };
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
 *       - CookieAuth: []
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
 *       - CookieAuth: []
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
  let limit = Number.parseInt(req.query.limit, 10) || 25;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
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

    // Batch-fetch enrichment data
    const [statsResult, repResult, warningsResult] = await Promise.all([
      userIds.length > 0
        ? pool.query(
            `SELECT user_id, messages_sent, days_active, last_active
               FROM user_stats
               WHERE guild_id = $1 AND user_id = ANY($2)`,
            [guild.id, userIds],
          )
        : { rows: [] },
      userIds.length > 0
        ? pool.query(
            `SELECT user_id, xp, level
               FROM reputation
               WHERE guild_id = $1 AND user_id = ANY($2)`,
            [guild.id, userIds],
          )
        : { rows: [] },
      userIds.length > 0
        ? pool.query(
            `SELECT target_id, COUNT(*)::integer AS count
               FROM mod_cases
               WHERE guild_id = $1 AND target_id = ANY($2) AND action = 'warn'
               GROUP BY target_id`,
            [guild.id, userIds],
          )
        : { rows: [] },
    ]);

    const statsMap = new Map(statsResult.rows.map((r) => [r.user_id, r]));
    const repMap = new Map(repResult.rows.map((r) => [r.user_id, r]));
    const warningsMap = new Map(warningsResult.rows.map((r) => [r.target_id, r.count]));

    // Build enriched member objects
    const enriched = memberList.map((m) => {
      const stats = statsMap.get(m.id) || {};
      const rep = repMap.get(m.id) || {};
      const warnings = warningsMap.get(m.id) || 0;

      return {
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL(),
        roles: Array.from(m.roles.cache.values()).map((r) => ({ id: r.id, name: r.name })),
        joinedAt: m.joinedAt,
        messages_sent: stats.messages_sent ?? 0,
        days_active: stats.days_active ?? 0,
        last_active: stats.last_active ?? null,
        xp: rep.xp ?? 0,
        level: rep.level ?? 0,
        warning_count: warnings,
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
 *       - CookieAuth: []
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
      const repConfig = getRepConfig(guild.id);
      const xp = rep?.xp ?? 0;
      const level = rep?.level ?? computeLevel(xp, repConfig.levelThresholds);
      const nextThreshold = repConfig.levelThresholds[level] ?? null;

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
 *       - CookieAuth: []
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
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
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
 *       - CookieAuth: []
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
      let newXp, newLevel;
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

        // Recompute level from thresholds
        const repConfig = getRepConfig(guildId);
        newLevel = computeLevel(newXp, repConfig.levelThresholds);

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
