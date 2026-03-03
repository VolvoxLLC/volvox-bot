/**
 * Migration 006: Command Usage Analytics Table
 *
 * Dedicated table for slash-command usage tracking.
 * Decouples dashboard metrics from log transport availability.
 * Replaces ad-hoc queries on the logs table's metadata field.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Enable pgcrypto extension for gen_random_uuid()
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS command_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      channel_id TEXT,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Index for guild-scoped time-series queries (dashboard analytics)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_guild_time
    ON command_usage(guild_id, used_at DESC)
  `);

  // Index for command popularity queries
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_command
    ON command_usage(command_name)
  `);

  // Index for per-user command history
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_user
    ON command_usage(user_id, used_at DESC)
  `);

  // Composite index for channel-filtered analytics queries
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_guild_channel_used_at
    ON command_usage(guild_id, channel_id, used_at DESC)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_command_usage_guild_channel_used_at`);
  pgm.sql(`DROP INDEX IF EXISTS idx_command_usage_user`);
  pgm.sql(`DROP INDEX IF EXISTS idx_command_usage_command`);
  pgm.sql(`DROP INDEX IF EXISTS idx_command_usage_guild_time`);
  pgm.sql(`DROP TABLE IF EXISTS command_usage`);
};
