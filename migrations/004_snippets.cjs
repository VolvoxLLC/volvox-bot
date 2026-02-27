/**
 * Add snippets table for /snippet code sharing command.
 * Stores named code snippets per guild with syntax-highlighted retrieval.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/41
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS snippets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'text',
      code TEXT NOT NULL,
      description TEXT,
      author_id TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, name)
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_snippets_guild ON snippets(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(guild_id, name)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS snippets CASCADE');
};
