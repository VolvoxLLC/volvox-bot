/**
 * Add user_stats table for engagement tracking (/profile command).
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/44
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      messages_sent INTEGER DEFAULT 0,
      reactions_given INTEGER DEFAULT 0,
      reactions_received INTEGER DEFAULT 0,
      days_active INTEGER DEFAULT 0,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_active TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_user_stats_guild ON user_stats(guild_id)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS user_stats CASCADE');
};
