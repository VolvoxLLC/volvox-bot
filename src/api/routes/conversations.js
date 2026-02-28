/**
 * Conversation Routes
 * Endpoints for viewing, searching, and flagging AI conversations.
 *
 * Mounted at /api/v1/guilds/:id/conversations
 */

import { Router } from 'express';
import { info, error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router({ mergeParams: true });

/** Rate limiter: 60 requests / 1 min per IP */
const conversationsRateLimit = rateLimit({ windowMs: 60 * 1000, max: 60 });

/** Conversation grouping gap in minutes */
const CONVERSATION_GAP_MINUTES = 15;

/**
 * Parse pagination query params with defaults and capping.
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

/**
 * Estimate token count from text content.
 * Rough heuristic: ~4 characters per token.
 *
 * @param {string} content
 * @returns {number}
 */
function estimateTokens(content) {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

/**
 * Group flat message rows into conversations based on channel_id + time gap.
 * Messages in the same channel within CONVERSATION_GAP_MINUTES are grouped together.
 *
 * @param {Array<Object>} rows - Flat message rows sorted by created_at ASC
 * @returns {Array<Object>} Grouped conversations
 */
export function groupMessagesIntoConversations(rows) {
  if (!rows || rows.length === 0) return [];

  const gapMs = CONVERSATION_GAP_MINUTES * 60 * 1000;
  const channelGroups = new Map();

  for (const row of rows) {
    const channelId = row.channel_id;
    if (!channelGroups.has(channelId)) {
      channelGroups.set(channelId, []);
    }
    channelGroups.get(channelId).push(row);
  }

  const conversations = [];

  for (const [channelId, messages] of channelGroups) {
    // Messages should already be sorted by created_at
    let currentConvo = null;

    for (const msg of messages) {
      const msgTime = new Date(msg.created_at).getTime();

      if (!currentConvo || msgTime - currentConvo.lastTime > gapMs) {
        // Start a new conversation
        if (currentConvo) {
          conversations.push(currentConvo);
        }
        currentConvo = {
          id: msg.id,
          channelId,
          messages: [msg],
          firstTime: msgTime,
          lastTime: msgTime,
        };
      } else {
        currentConvo.messages.push(msg);
        currentConvo.lastTime = msgTime;
      }
    }

    if (currentConvo) {
      conversations.push(currentConvo);
    }
  }

  // Sort conversations by most recent first
  conversations.sort((a, b) => b.lastTime - a.lastTime);

  return conversations;
}

/**
 * Build a conversation summary from grouped messages.
 *
 * @param {Object} convo - Grouped conversation object
 * @param {import('discord.js').Guild} [guild] - Optional guild for channel name resolution
 * @returns {Object} Conversation summary
 */
function buildConversationSummary(convo, guild) {
  const participantMap = new Map();
  for (const msg of convo.messages) {
    const key = `${msg.username || 'unknown'}-${msg.role}`;
    if (!participantMap.has(key)) {
      participantMap.set(key, { username: msg.username || 'unknown', role: msg.role });
    }
  }

  const firstMsg = convo.messages[0];
  const preview = firstMsg?.content
    ? firstMsg.content.slice(0, 100) + (firstMsg.content.length > 100 ? '…' : '')
    : '';

  const channelName = guild?.channels?.cache?.get(convo.channelId)?.name || convo.channelId;

  return {
    id: convo.id,
    channelId: convo.channelId,
    channelName,
    participants: Array.from(participantMap.values()),
    messageCount: convo.messages.length,
    firstMessageAt: new Date(convo.firstTime).toISOString(),
    lastMessageAt: new Date(convo.lastTime).toISOString(),
    preview,
  };
}

// ─── GET / — List conversations (grouped) ─────────────────────────────────────

/**
 * GET / — List conversations grouped by channel + time proximity
 * Query params: ?page=1&limit=25&search=<text>&user=<username>&channel=<channelId>&from=<date>&to=<date>
 */
router.get('/', conversationsRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;
  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { page, limit } = parsePagination(req.query);
  const guildId = req.params.id;

  try {
    // Build WHERE clauses
    const whereParts = ['guild_id = $1'];
    const values = [guildId];
    let paramIndex = 1;

    if (req.query.search && typeof req.query.search === 'string') {
      paramIndex++;
      whereParts.push(`content ILIKE $${paramIndex}`);
      const escaped = req.query.search.replace(/[%_\\]/g, (c) => `\\${c}`);
      values.push(`%${escaped}%`);
    }

    if (req.query.user && typeof req.query.user === 'string') {
      paramIndex++;
      whereParts.push(`username = $${paramIndex}`);
      values.push(req.query.user);
    }

    if (req.query.channel && typeof req.query.channel === 'string') {
      paramIndex++;
      whereParts.push(`channel_id = $${paramIndex}`);
      values.push(req.query.channel);
    }

    if (req.query.from && typeof req.query.from === 'string') {
      const from = new Date(req.query.from);
      if (!Number.isNaN(from.getTime())) {
        paramIndex++;
        whereParts.push(`created_at >= $${paramIndex}`);
        values.push(from.toISOString());
      }
    }

    if (req.query.to && typeof req.query.to === 'string') {
      const to = new Date(req.query.to);
      if (!Number.isNaN(to.getTime())) {
        paramIndex++;
        whereParts.push(`created_at <= $${paramIndex}`);
        values.push(to.toISOString());
      }
    }

    const whereClause = whereParts.join(' AND ');

    // Fetch matching messages for grouping (capped at 5000 rows to prevent memory exhaustion)
    // Time-based grouping requires sorted rows; paginate after grouping
    const result = await dbPool.query(
      `SELECT id, channel_id, role, content, username, created_at
         FROM conversations
         WHERE ${whereClause}
         ORDER BY created_at ASC
         LIMIT 5000`,
      values,
    );

    const allConversations = groupMessagesIntoConversations(result.rows);
    const total = allConversations.length;

    // Paginate grouped conversations
    const startIdx = (page - 1) * limit;
    const paginatedConversations = allConversations.slice(startIdx, startIdx + limit);

    const conversations = paginatedConversations.map((convo) =>
      buildConversationSummary(convo, req.guild),
    );

    res.json({ conversations, total, page });
  } catch (err) {
    logError('Failed to fetch conversations', { error: err.message, guild: guildId });
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ─── GET /stats — Conversation analytics ──────────────────────────────────────

/**
 * GET /stats — Conversation analytics
 * Returns aggregate stats about conversations for the guild.
 */
router.get('/stats', conversationsRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;
  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const guildId = req.params.id;

  try {
    const [totalResult, topUsersResult, dailyResult, tokenResult] = await Promise.all([
      dbPool.query(
        'SELECT COUNT(*)::int AS total_messages FROM conversations WHERE guild_id = $1',
        [guildId],
      ),
      dbPool.query(
        `SELECT username, COUNT(*)::int AS message_count
           FROM conversations
           WHERE guild_id = $1 AND username IS NOT NULL
           GROUP BY username
           ORDER BY message_count DESC
           LIMIT 10`,
        [guildId],
      ),
      dbPool.query(
        `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
           FROM conversations
           WHERE guild_id = $1
           GROUP BY DATE(created_at)
           ORDER BY date DESC
           LIMIT 30`,
        [guildId],
      ),
      dbPool.query(
        'SELECT COALESCE(SUM(LENGTH(content)), 0)::bigint AS total_chars FROM conversations WHERE guild_id = $1',
        [guildId],
      ),
    ]);

    const totalMessages = totalResult.rows[0]?.total_messages || 0;
    const totalChars = Number(tokenResult.rows[0]?.total_chars || 0);

    // Count conversations via SQL using window functions to detect time gaps
    // A new conversation starts when the gap from the previous message in the
    // same channel exceeds CONVERSATION_GAP_MINUTES (15 min).
    const convoCountResult = await dbPool.query(
      `SELECT COUNT(*)::int AS total_conversations FROM (
         SELECT CASE
           WHEN created_at - LAG(created_at) OVER (
             PARTITION BY channel_id ORDER BY created_at
           ) > interval '15 minutes'
           OR LAG(created_at) OVER (
             PARTITION BY channel_id ORDER BY created_at
           ) IS NULL
           THEN 1 ELSE NULL END AS is_start
         FROM conversations
         WHERE guild_id = $1
       ) sub WHERE is_start = 1`,
      [guildId],
    );

    const totalConversations = convoCountResult.rows[0]?.total_conversations || 0;
    const avgMessagesPerConversation =
      totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0;

    res.json({
      totalConversations,
      totalMessages,
      avgMessagesPerConversation,
      topUsers: topUsersResult.rows.map((r) => ({
        username: r.username,
        messageCount: r.message_count,
      })),
      dailyActivity: dailyResult.rows.map((r) => ({
        date: r.date,
        count: r.count,
      })),
      estimatedTokens: Math.ceil(totalChars / 4),
    });
  } catch (err) {
    logError('Failed to fetch conversation stats', { error: err.message, guild: guildId });
    res.status(500).json({ error: 'Failed to fetch conversation stats' });
  }
});

// ─── GET /flags — List flagged messages ───────────────────────────────────────

/**
 * GET /flags — List flagged messages
 * Query params: ?page=1&limit=25&status=open|resolved|dismissed
 */
router.get('/flags', conversationsRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;
  if (!dbPool) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { page, limit, offset } = parsePagination(req.query);
  const guildId = req.params.id;

  try {
    const whereParts = ['fm.guild_id = $1'];
    const values = [guildId];
    let paramIndex = 1;

    const validStatuses = ['open', 'resolved', 'dismissed'];
    if (req.query.status && validStatuses.includes(req.query.status)) {
      paramIndex++;
      whereParts.push(`fm.status = $${paramIndex}`);
      values.push(req.query.status);
    }

    const whereClause = whereParts.join(' AND ');

    const [countResult, flagsResult] = await Promise.all([
      dbPool.query(
        `SELECT COUNT(*)::int AS count FROM flagged_messages fm WHERE ${whereClause}`,
        values,
      ),
      dbPool.query(
        `SELECT fm.id, fm.guild_id, fm.conversation_first_id, fm.message_id,
                  fm.flagged_by, fm.reason, fm.notes, fm.status,
                  fm.resolved_by, fm.resolved_at, fm.created_at,
                  c.content AS message_content, c.role AS message_role,
                  c.username AS message_username
           FROM flagged_messages fm
           LEFT JOIN conversations c ON c.id = fm.message_id
           WHERE ${whereClause}
           ORDER BY fm.created_at DESC
           LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`,
        [...values, limit, offset],
      ),
    ]);

    res.json({
      flags: flagsResult.rows.map((r) => ({
        id: r.id,
        guildId: r.guild_id,
        conversationFirstId: r.conversation_first_id,
        messageId: r.message_id,
        flaggedBy: r.flagged_by,
        reason: r.reason,
        notes: r.notes,
        status: r.status,
        resolvedBy: r.resolved_by,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
        messageContent: r.message_content,
        messageRole: r.message_role,
        messageUsername: r.message_username,
      })),
      total: countResult.rows[0]?.count || 0,
      page,
    });
  } catch (err) {
    logError('Failed to fetch flagged messages', { error: err.message, guild: guildId });
    res.status(500).json({ error: 'Failed to fetch flagged messages' });
  }
});

// ─── GET /:conversationId — Single conversation detail ────────────────────────

/**
 * GET /:conversationId — Fetch all messages in a conversation for replay
 * The conversationId is the ID of the first message in the conversation.
 */
router.get(
  '/:conversationId',
  conversationsRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { dbPool } = req.app.locals;
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const guildId = req.params.id;
    const conversationId = Number.parseInt(req.params.conversationId, 10);

    if (Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    try {
      // First, fetch the anchor message to get channel_id and created_at
      const anchorResult = await dbPool.query(
        `SELECT id, channel_id, created_at
         FROM conversations
         WHERE id = $1 AND guild_id = $2`,
        [conversationId, guildId],
      );

      if (anchorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const anchor = anchorResult.rows[0];

      // Fetch all messages in the same channel around the anchor
      const messagesResult = await dbPool.query(
        `SELECT id, channel_id, role, content, username, created_at
         FROM conversations
         WHERE guild_id = $1 AND channel_id = $2
         ORDER BY created_at ASC`,
        [guildId, anchor.channel_id],
      );

      // Group into conversations and find the one containing our anchor
      const allConvos = groupMessagesIntoConversations(messagesResult.rows);
      const targetConvo = allConvos.find((c) => c.id === conversationId);

      if (!targetConvo) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const messages = targetConvo.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        username: msg.username,
        createdAt: msg.created_at,
      }));

      const durationMs = targetConvo.lastTime - targetConvo.firstTime;

      // Fetch any flags for messages in this conversation
      const messageIds = messages.map((m) => m.id);
      const flagsResult = await dbPool.query(
        `SELECT message_id, status FROM flagged_messages
         WHERE guild_id = $1 AND message_id = ANY($2)`,
        [guildId, messageIds],
      );

      const flaggedMessageIds = new Map(flagsResult.rows.map((r) => [r.message_id, r.status]));

      const enrichedMessages = messages.map((m) => ({
        ...m,
        flagStatus: flaggedMessageIds.get(m.id) || null,
      }));

      res.json({
        messages: enrichedMessages,
        channelId: anchor.channel_id,
        duration: Math.round(durationMs / 1000),
        tokenEstimate: estimateTokens(messages.map((m) => m.content || '').join('')),
      });
    } catch (err) {
      logError('Failed to fetch conversation detail', {
        error: err.message,
        guild: guildId,
        conversationId,
      });
      res.status(500).json({ error: 'Failed to fetch conversation detail' });
    }
  },
);

// ─── POST /:conversationId/flag — Flag a message ─────────────────────────────

/**
 * POST /:conversationId/flag — Flag a problematic AI response
 * Body: { messageId: number, reason: string, notes?: string }
 */
router.post(
  '/:conversationId/flag',
  conversationsRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { dbPool } = req.app.locals;
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const guildId = req.params.id;
    const conversationId = Number.parseInt(req.params.conversationId, 10);

    if (Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const { messageId, reason, notes } = req.body || {};

    if (!messageId || typeof messageId !== 'number') {
      return res.status(400).json({ error: 'messageId is required and must be a number' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'reason is required and must be a non-empty string' });
    }

    if (reason.length > 500) {
      return res.status(400).json({ error: 'reason must not exceed 500 characters' });
    }

    if (notes && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' });
    }

    if (notes && notes.length > 2000) {
      return res.status(400).json({ error: 'notes must not exceed 2000 characters' });
    }

    try {
      // Verify the message exists and belongs to this guild
      const msgCheck = await dbPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND guild_id = $2',
        [messageId, guildId],
      );

      if (msgCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Determine flagged_by from auth context
      const flaggedBy = req.user?.userId || 'api-secret';

      const insertResult = await dbPool.query(
        `INSERT INTO flagged_messages (guild_id, conversation_first_id, message_id, flagged_by, reason, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status`,
        [guildId, conversationId, messageId, flaggedBy, reason.trim(), notes?.trim() || null],
      );

      const flag = insertResult.rows[0];

      info('Message flagged', {
        guildId,
        conversationId,
        messageId,
        flagId: flag.id,
        flaggedBy,
      });

      res.status(201).json({ flagId: flag.id, status: flag.status });
    } catch (err) {
      logError('Failed to flag message', {
        error: err.message,
        guild: guildId,
        conversationId,
        messageId,
      });
      res.status(500).json({ error: 'Failed to flag message' });
    }
  },
);

export default router;
