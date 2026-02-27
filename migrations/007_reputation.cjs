/**
 * Add reputation table for XP/leveling system.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/45
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reputation (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      messages_count INTEGER NOT NULL DEFAULT 0,
      voice_minutes INTEGER NOT NULL DEFAULT 0,
      helps_given INTEGER NOT NULL DEFAULT 0,
      last_xp_gain TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reputation_guild_xp ON reputation(guild_id, xp DESC)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS reputation CASCADE');
};
