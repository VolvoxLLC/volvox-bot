/**
 * Migration: starboard_posts table
 *
 * Tracks which messages have been reposted to the starboard channel,
 * enabling dedup (update instead of repost) and star-count syncing.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS starboard_posts (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL UNIQUE,
      source_channel_id TEXT NOT NULL,
      starboard_message_id TEXT NOT NULL,
      star_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // No explicit index needed — UNIQUE constraint on source_message_id creates one implicitly
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS starboard_posts CASCADE');
};
