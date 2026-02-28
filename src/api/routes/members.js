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
 * GET /:id/members/export — Export all members with stats as CSV
 * Streams a CSV file with enriched member data.
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

      // Fetch all members — paginate in batches of 1000 for large guilds
      const members = new Map();
      let lastId;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const fetchOpts = { limit: 1000 };
        if (lastId) fetchOpts.after = lastId;
        const batch = await guild.members.list(fetchOpts);
        if (batch.size === 0) break;
        for (const [id, member] of batch) {
          members.set(id, member);
        }
        lastId = Array.from(batch.keys()).pop();
        if (batch.size < 1000) break; // Last page
      }

      const userIds = Array.from(members.keys());

      // Batch-fetch stats and reputation
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

      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');

      // Write CSV header row
      res.write('userId,username,displayName,joinedAt,messages,xp,level,daysActive,warnings\n');

      // Write each member row
      for (const [, member] of members) {
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

      res.end();

      info('Members CSV exported', { guildId: guild.id, count: members.size });
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
 * GET /:id/members — Enhanced member list with bot data
 * Query params:
 *   limit  (default 25, max 100)
 *   after  — cursor for Discord pagination
 *   search — filter by username/displayName
 *   sort   — messages|xp|warnings|joined (default: joined)
 *   order  — asc|desc (default: desc)
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
 * GET /:id/members/:userId — Full member profile with stats, XP, and warnings
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
 * GET /:id/members/:userId/cases — Paginated mod case history for a user
 * Query params:
 *   page  (default 1)
 *   limit (default 25, max 100)
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
 * POST /:id/members/:userId/xp — Adjust a member's XP
 * Body: { amount: number, reason?: string }
 * Positive or negative adjustment. Returns updated XP/level.
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
