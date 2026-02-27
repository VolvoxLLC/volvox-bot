/**
 * Add github_feed_state table for GitHub activity feed module.
 * Tracks per-guild, per-repo polling state for dedup.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/51
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS github_feed_state (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      last_event_id TEXT,
      last_poll_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, repo)
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_github_feed_guild ON github_feed_state(guild_id)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS github_feed_state CASCADE');
};
