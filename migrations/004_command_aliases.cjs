/**
 * Migration 004: Guild Command Aliases Table
 *
 * Stores per-guild command aliases created by guild admins.
 * Each alias maps a short custom name (e.g. "w") to an existing bot command (e.g. "warn").
 * discord_command_id stores the ID returned by Discord after registering the alias
 * as a guild-specific slash command, enabling clean removal later.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS guild_command_aliases (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      target_command TEXT NOT NULL,
      discord_command_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, alias)
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_guild_command_aliases_guild_id
    ON guild_command_aliases(guild_id)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_guild_command_aliases_guild_id`);
  pgm.sql(`DROP TABLE IF EXISTS guild_command_aliases`);
};
