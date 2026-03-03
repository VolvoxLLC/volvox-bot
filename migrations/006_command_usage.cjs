/**
 * Migration 006: Command Usage Table
 *
 * Dedicated table for slash-command analytics. Replaces inline aggregation
 * from the logs table for faster analytics queries and historical trend analysis.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/122
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS command_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      channel_id TEXT,
      used_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_guild_used_at
    ON command_usage(guild_id, used_at)
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_user_id
    ON command_usage(user_id)
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_command_name
    ON command_usage(command_name)
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_command_usage_guild_channel_used_at
    ON command_usage(guild_id, channel_id, used_at)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_command_usage_guild_channel_used_at');
  pgm.sql('DROP INDEX IF EXISTS idx_command_usage_command_name');
  pgm.sql('DROP INDEX IF EXISTS idx_command_usage_user_id');
  pgm.sql('DROP INDEX IF EXISTS idx_command_usage_guild_used_at');
  pgm.sql('DROP TABLE IF EXISTS command_usage');
};
