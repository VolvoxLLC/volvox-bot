/**
 * Add polls table for /poll voting system.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/47
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      author_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      votes JSONB NOT NULL DEFAULT '{}',
      multi_vote BOOLEAN NOT NULL DEFAULT false,
      anonymous BOOLEAN NOT NULL DEFAULT false,
      duration_minutes INTEGER,
      closes_at TIMESTAMPTZ,
      closed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_polls_guild ON polls(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_polls_open ON polls(guild_id) WHERE closed = false');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS polls CASCADE');
};
