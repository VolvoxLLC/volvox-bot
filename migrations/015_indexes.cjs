/**
 * Migration 015: Add missing performance indexes
 *
 * Adds indexes on high-traffic columns to improve query performance.
 * All indexes use IF NOT EXISTS to be idempotent.
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  // conversations: queries by guild + channel + time range
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_conversations_guild_channel_created
      ON conversations(guild_id, channel_id, created_at)
  `);

  // mod_cases: queries by guild + time for mod log
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_created
      ON mod_cases(guild_id, created_at)
  `);

  // reminders: partial index — only incomplete reminders queried by due time
  // Table may not exist yet; skip gracefully if so.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reminders'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_reminders_due
          ON reminders(remind_at)
          WHERE completed = false;
      END IF;
    END;
    $$
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_conversations_guild_channel_created');
  pgm.sql('DROP INDEX IF EXISTS idx_mod_cases_guild_created');
  pgm.sql('DROP INDEX IF EXISTS idx_reminders_due');
};
