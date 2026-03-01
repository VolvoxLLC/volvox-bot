/**
 * Migration 014: Add discord_message_id to conversations table
 *
 * Stores the native Discord message ID alongside each conversation row so the
 * dashboard can construct clickable jump URLs for individual messages.
 * Existing rows will have NULL for this column (history before this migration).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS discord_message_id TEXT
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
    DROP COLUMN IF EXISTS discord_message_id
  `);
};
