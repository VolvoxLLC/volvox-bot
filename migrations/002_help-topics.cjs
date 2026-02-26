/**
 * Help topics migration.
 *
 * Creates the help_topics table for the /help FAQ command.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS help_topics (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, topic)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_help_topics_guild ON help_topics(guild_id)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS help_topics CASCADE');
};
