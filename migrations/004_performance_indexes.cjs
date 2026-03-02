/**
 * Migration 004: Performance Indexes
 *
 * Adds missing composite indexes and a pg_trgm GIN index to resolve:
 *
 * 1. ai_feedback trend queries — getFeedbackTrend() filters by guild_id AND
 *    created_at but only had a single-column guild_id index, forcing a full
 *    guild scan + sort for every trend call.
 *
 * 2. conversations ILIKE search — content ILIKE '%...%' is a seq-scan
 *    without pg_trgm. Installing the extension + GIN index reduces search from
 *    O(n) to O(log n * trigram matches).
 *
 * 3. conversations(guild_id, created_at) — The default 30-day listing query
 *    (WHERE guild_id = $1 AND created_at >= $2 ORDER BY created_at DESC)
 *    benefits from a dedicated 2-column index over the existing 3-column
 *    (guild_id, channel_id, created_at) composite when channel_id is not filtered.
 *
 * 4. flagged_messages(guild_id, message_id) — POST /flag and the detail
 *    endpoint both do WHERE guild_id = $1 AND message_id = ANY($2) which
 *    the existing (guild_id, status) index cannot serve efficiently.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ai_feedback: composite for trend + recent queries
  // getFeedbackTrend: WHERE guild_id = $1 AND created_at >= NOW() - INTERVAL ...
  // getRecentFeedback: WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_ai_feedback_guild_created
    ON ai_feedback(guild_id, created_at DESC)
  `);

  // conversations: pg_trgm for ILIKE searches
  // Enable the extension first (idempotent)
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // GIN index over content column -- supports col ILIKE '%term%' and col ~ 'pattern'
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_conversations_content_trgm
    ON conversations USING gin(content gin_trgm_ops)
  `);

  // conversations: (guild_id, created_at) for default 30-day listing
  // The existing idx_conversations_guild_channel_created covers (guild_id, channel_id, created_at)
  // but queries that filter only by guild_id + date range skip the channel_id column,
  // making this 2-column index cheaper to scan.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_conversations_guild_created
    ON conversations(guild_id, created_at DESC)
  `);

  // flagged_messages: (guild_id, message_id) for detail + flag endpoints
  // Used by:
  //   GET /:conversationId  -> WHERE guild_id = $1 AND message_id = ANY($2)
  //   POST /:conversationId/flag -> msgCheck + anchorCheck in parallel
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_flagged_messages_guild_message
    ON flagged_messages(guild_id, message_id)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_flagged_messages_guild_message`);
  pgm.sql(`DROP INDEX IF EXISTS idx_conversations_guild_created`);
  pgm.sql(`DROP INDEX IF EXISTS idx_conversations_content_trgm`);
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_feedback_guild_created`);
  // Note: do NOT drop pg_trgm extension on down -- it may be used elsewhere.
};
