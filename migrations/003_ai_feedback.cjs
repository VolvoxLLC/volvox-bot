/**
 * Migration 003: AI Response Feedback Table
 *
 * Stores 👍/👎 reactions from users on AI-generated messages.
 * Per-user per-message deduplication via UNIQUE constraint.
 * Gated behind ai.feedback.enabled in config (opt-in per guild).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id SERIAL PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_ai_feedback_guild_id
    ON ai_feedback(guild_id)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_ai_feedback_message_id
    ON ai_feedback(message_id)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_ai_feedback_guild_created
    ON ai_feedback(guild_id, created_at)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_feedback_guild_created`);
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_feedback_message_id`);
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_feedback_guild_id`);
  pgm.sql(`DROP TABLE IF EXISTS ai_feedback`);
};
