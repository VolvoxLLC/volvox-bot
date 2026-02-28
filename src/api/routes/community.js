/**
 * Community Routes — Public API
 * Public endpoints for community leaderboards, showcases, stats, and profiles.
 * NO authentication required. Heavy rate limiting applied.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/36
 */

import { Router } from 'express';
import { error as logError } from '../../logger.js';
import { getConfig } from '../../modules/config.js';
import { computeLevel } from '../../modules/reputation.js';
import { REPUTATION_DEFAULTS } from '../../modules/reputationDefaults.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

/** Aggressive rate limiter for public endpoints: 30 req/min per IP */
const communityRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
router.use(communityRateLimit);

/**
 * Obtain the reputation configuration for a guild by merging guild-specific settings with defaults.
 * @param {string} guildId - The guild identifier to load configuration for.
 * @returns {object} The reputation configuration with guild-specific values overriding defaults.
 */
function getRepConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...REPUTATION_DEFAULTS, ...cfg.reputation };
}

/**
 * Map a numeric reputation level to its corresponding badge label.
 * @param {number} level - The reputation level.
 * @returns {string} The badge label: `🏆 Legend` for level >= 10, `⭐ Expert` for level >= 7, `🔥 Veteran` for level >= 5, `💪 Regular` for level >= 3, `🌱 Newcomer` for level >= 1, `👋 New` otherwise.
 */
function getLevelBadge(level) {
  if (level >= 10) return '🏆 Legend';
  if (level >= 7) return '⭐ Expert';
  if (level >= 5) return '🔥 Veteran';
  if (level >= 3) return '💪 Regular';
  if (level >= 1) return '🌱 Newcomer';
  return '👋 New';
}

/**
 * Retrieve the PostgreSQL pool stored on app.locals for the current request, or null if not set.
 * @param {import('express').Request} req - Express request object used to access app.locals.
 * @returns {import('pg').Pool | null} `Pool` if present on `req.app.locals.dbPool`, `null` otherwise.
 */
function getDbPool(req) {
  return req.app.locals.dbPool || null;
}

// ─── GET /:guildId/leaderboard ────────────────────────────────────────────────

/**
 * GET /:guildId/leaderboard — Top members by XP (public profiles only)
 * Query: ?limit=25&page=1
 */
router.get('/:guildId/leaderboard', async (req, res) => {
  const { guildId } = req.params;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  let limit = Number.parseInt(req.query.limit, 10) || 25;
  let page = Number.parseInt(req.query.page, 10) || 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;

  try {
    const repConfig = getRepConfig(guildId);

    const [countResult, membersResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM user_stats us
         INNER JOIN reputation r ON r.guild_id = us.guild_id AND r.user_id = us.user_id
         WHERE us.guild_id = $1 AND us.public_profile = TRUE`,
        [guildId],
      ),
      pool.query(
        `SELECT us.user_id, r.xp, r.level
         FROM user_stats us
         INNER JOIN reputation r ON r.guild_id = us.guild_id AND r.user_id = us.user_id
         WHERE us.guild_id = $1 AND us.public_profile = TRUE
         ORDER BY r.xp DESC
         LIMIT $2 OFFSET $3`,
        [guildId, limit, offset],
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const { client } = req.app.locals;
    const guild = client?.guilds?.cache?.get(guildId);

    const leaderboardUserIds = membersResult.rows.map((r) => r.user_id);
    const fetchedLeaderboardMembers = guild
      ? await guild.members.fetch({ user: leaderboardUserIds }).catch(() => new Map())
      : new Map();

    const members = membersResult.rows.map((row, idx) => {
      const level = computeLevel(row.xp, repConfig.levelThresholds);
      let username = row.user_id;
      let displayName = row.user_id;
      let avatar = null;

      const member = fetchedLeaderboardMembers.get(row.user_id);
      if (member) {
        username = member.user.username;
        displayName = member.displayName;
        avatar = member.user.displayAvatarURL();
      }

      return {
        userId: row.user_id,
        username,
        displayName,
        avatar,
        xp: row.xp,
        level,
        badge: getLevelBadge(level),
        rank: offset + idx + 1,
      };
    });

    res.json({ members, total, page });
  } catch (err) {
    logError('Failed to fetch community leaderboard', {
      error: err.message,
      guildId,
    });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ─── GET /:guildId/showcases ──────────────────────────────────────────────────

/**
 * GET /:guildId/showcases — Project showcase gallery
 * Query: ?limit=12&page=1&sort=upvotes|recent
 */
router.get('/:guildId/showcases', async (req, res) => {
  const { guildId } = req.params;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  let limit = Number.parseInt(req.query.limit, 10) || 12;
  let page = Number.parseInt(req.query.page, 10) || 1;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;

  const sort = req.query.sort === 'recent' ? 'recent' : 'upvotes';
  const orderBy = sort === 'recent' ? 's.created_at DESC' : 's.upvotes DESC, s.created_at DESC';

  try {
    const [countResult, projectsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM showcases s
         INNER JOIN user_stats us ON us.guild_id = s.guild_id AND us.user_id = s.author_id
         WHERE s.guild_id = $1 AND us.public_profile = TRUE`,
        [guildId],
      ),
      pool.query(
        `SELECT s.id, s.name, s.description, s.tech_stack, s.repo_url, s.live_url,
                s.author_id, s.upvotes, s.created_at
         FROM showcases s
         INNER JOIN user_stats us ON us.guild_id = s.guild_id AND us.user_id = s.author_id
         WHERE s.guild_id = $1 AND us.public_profile = TRUE
         ORDER BY ${orderBy}
         LIMIT $2 OFFSET $3`,
        [guildId, limit, offset],
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const { client } = req.app.locals;
    const guild = client?.guilds?.cache?.get(guildId);

    const authorIds = projectsResult.rows.map((r) => r.author_id);
    const fetchedAuthors = guild
      ? await guild.members.fetch({ user: authorIds }).catch(() => new Map())
      : new Map();

    const projects = projectsResult.rows.map((row) => {
      let authorName = row.author_id;
      let authorAvatar = null;

      const member = fetchedAuthors.get(row.author_id);
      if (member) {
        authorName = member.displayName;
        authorAvatar = member.user.displayAvatarURL();
      }

      return {
        id: row.id,
        title: row.name,
        description: row.description,
        tech: row.tech_stack || [],
        repoUrl: row.repo_url,
        liveUrl: row.live_url,
        authorName,
        authorAvatar,
        upvotes: row.upvotes,
        createdAt: row.created_at,
      };
    });

    res.json({ projects, total, page });
  } catch (err) {
    logError('Failed to fetch community showcases', {
      error: err.message,
      guildId,
    });
    res.status(500).json({ error: 'Failed to fetch showcases' });
  }
});

// ─── GET /:guildId/stats ──────────────────────────────────────────────────────

/**
 * GET /:guildId/stats — Community stats banner
 */
router.get('/:guildId/stats', async (req, res) => {
  const { guildId } = req.params;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  try {
    const repConfig = getRepConfig(guildId);

    const [memberCount, messagesResult, projectsResult, challengesResult, topContributors] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM user_stats
           WHERE guild_id = $1 AND public_profile = TRUE`,
          [guildId],
        ),
        pool.query(
          `SELECT COALESCE(SUM(messages_sent), 0)::int AS total
           FROM user_stats
           WHERE guild_id = $1 AND last_active >= NOW() - INTERVAL '7 days'`,
          [guildId],
        ),
        pool.query('SELECT COUNT(*)::int AS count FROM showcases WHERE guild_id = $1', [guildId]),
        pool.query('SELECT COUNT(*)::int AS count FROM challenge_solves WHERE guild_id = $1', [
          guildId,
        ]),
        pool.query(
          `SELECT us.user_id, r.xp, r.level
           FROM user_stats us
           INNER JOIN reputation r ON r.guild_id = us.guild_id AND r.user_id = us.user_id
           WHERE us.guild_id = $1 AND us.public_profile = TRUE
           ORDER BY r.xp DESC
           LIMIT 3`,
          [guildId],
        ),
      ]);

    const { client } = req.app.locals;
    const guild = client?.guilds?.cache?.get(guildId);

    const topContributorUserIds = topContributors.rows.map((r) => r.user_id);
    const fetchedTopMembers = guild
      ? await guild.members.fetch({ user: topContributorUserIds }).catch(() => new Map())
      : new Map();

    const top3 = topContributors.rows.map((row) => {
      const level = computeLevel(row.xp, repConfig.levelThresholds);
      let username = row.user_id;
      let displayName = row.user_id;
      let avatar = null;

      const member = fetchedTopMembers.get(row.user_id);
      if (member) {
        username = member.user.username;
        displayName = member.displayName;
        avatar = member.user.displayAvatarURL();
      }

      return {
        userId: row.user_id,
        username,
        displayName,
        avatar,
        xp: row.xp,
        level,
        badge: getLevelBadge(level),
      };
    });

    res.json({
      memberCount: memberCount.rows[0]?.count ?? 0,
      messagesThisWeek: messagesResult.rows[0]?.total ?? 0,
      activeProjects: projectsResult.rows[0]?.count ?? 0,
      challengesCompleted: challengesResult.rows[0]?.count ?? 0,
      topContributors: top3,
    });
  } catch (err) {
    logError('Failed to fetch community stats', {
      error: err.message,
      guildId,
    });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /:guildId/profile/:userId ────────────────────────────────────────────

/**
 * GET /:guildId/profile/:userId — Public user profile
 * Only returns data if user has public_profile = true.
 */
router.get('/:guildId/profile/:userId', async (req, res) => {
  const { guildId, userId } = req.params;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  try {
    // Check if user has opted in to public profile
    const statsResult = await pool.query(
      `SELECT messages_sent, reactions_given, reactions_received, days_active,
              first_seen, last_active, public_profile
       FROM user_stats
       WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId],
    );

    if (statsResult.rows.length === 0 || !statsResult.rows[0].public_profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const stats = statsResult.rows[0];
    const repConfig = getRepConfig(guildId);

    // Fetch reputation and showcase data in parallel
    const [repResult, showcasesResult] = await Promise.all([
      pool.query(
        `SELECT xp, level, messages_count, voice_minutes, helps_given
         FROM reputation
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId],
      ),
      pool.query(
        `SELECT id, name, description, tech_stack, repo_url, live_url, upvotes, created_at
         FROM showcases
         WHERE guild_id = $1 AND author_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [guildId, userId],
      ),
    ]);

    const rep = repResult.rows[0] || { xp: 0, level: 0 };
    const level = computeLevel(rep.xp, repConfig.levelThresholds);

    // Resolve Discord user info
    const { client } = req.app.locals;
    const guild = client?.guilds?.cache?.get(guildId);
    let username = userId;
    let displayName = userId;
    let avatar = null;
    let joinedAt = null;

    if (guild) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          username = member.user.username;
          displayName = member.displayName;
          avatar = member.user.displayAvatarURL();
          joinedAt = member.joinedAt;
        }
      } catch {
        // Member may have left
      }
    }

    const projects = showcasesResult.rows.map((row) => ({
      id: row.id,
      title: row.name,
      description: row.description,
      tech: row.tech_stack || [],
      repoUrl: row.repo_url,
      liveUrl: row.live_url,
      upvotes: row.upvotes,
      createdAt: row.created_at,
    }));

    // Build recent badges based on activity milestones
    const recentBadges = [];
    if (stats.messages_sent >= 1000)
      recentBadges.push({ name: '💬 Chatterbox', description: '1,000+ messages' });
    if (stats.messages_sent >= 100)
      recentBadges.push({ name: '🗣️ Active Voice', description: '100+ messages' });
    if (stats.days_active >= 30)
      recentBadges.push({ name: '📅 Monthly Regular', description: '30+ days active' });
    if (stats.days_active >= 7)
      recentBadges.push({ name: '🔄 Week Warrior', description: '7+ days active' });
    if (stats.reactions_given >= 50)
      recentBadges.push({ name: '❤️ Generous', description: '50+ reactions given' });
    if (projects.length >= 3)
      recentBadges.push({ name: '🚀 Prolific Builder', description: '3+ projects showcased' });
    if (projects.length >= 1)
      recentBadges.push({ name: '🛠️ Builder', description: 'Has a project showcase' });

    res.json({
      username,
      displayName,
      avatar,
      xp: rep.xp,
      level,
      badge: getLevelBadge(level),
      joinedAt,
      stats: {
        messagesSent: stats.messages_sent,
        reactionsGiven: stats.reactions_given,
        reactionsReceived: stats.reactions_received,
        daysActive: stats.days_active,
      },
      projects,
      recentBadges,
    });
  } catch (err) {
    logError('Failed to fetch community profile', {
      error: err.message,
      guildId,
      userId,
    });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export { communityRateLimit };
export default router;
