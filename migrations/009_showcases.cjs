/**
 * Add showcases and showcase_votes tables for /showcase project showcase system.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/50
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS showcases (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tech_stack TEXT[] DEFAULT '{}',
      repo_url TEXT,
      live_url TEXT,
      message_id TEXT,
      channel_id TEXT,
      upvotes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_showcases_guild ON showcases(guild_id)');
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_showcases_author ON showcases(guild_id, author_id)',
  );

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS showcase_votes (
      guild_id TEXT NOT NULL,
      showcase_id INTEGER NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, showcase_id, user_id)
    )
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS showcase_votes CASCADE');
  pgm.sql('DROP TABLE IF EXISTS showcases CASCADE');
};
