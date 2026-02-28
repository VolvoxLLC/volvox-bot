/**
 * Migration 013 — Public Profiles
 * Adds public_profile flag to user_stats for community page opt-in.
 * Users must explicitly opt in before appearing on public leaderboards/profiles.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/36
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_stats
    ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT FALSE
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_user_stats_guild_public
    ON user_stats(guild_id, public_profile)
    WHERE public_profile = TRUE
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_user_stats_guild_public');
  pgm.sql('ALTER TABLE user_stats DROP COLUMN IF EXISTS public_profile');
};
