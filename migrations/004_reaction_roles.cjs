'use strict';

/**
 * Migration: Reaction Role Menus
 *
 * Creates tables to persist reaction-role mappings across bot restarts.
 *
 * - reaction_role_menus: One row per "reaction role" message posted in Discord
 * - reaction_role_entries: One row per emoji→role mapping attached to a menu
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── reaction_role_menus ────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reaction_role_menus (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'React to get a role',
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (guild_id, message_id)
    )
  `);
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_reaction_role_menus_guild ON reaction_role_menus(guild_id)',
  );
  pgm.sql(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_role_menus_message ON reaction_role_menus(message_id)',
  );

  // ── reaction_role_entries ──────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reaction_role_entries (
      id SERIAL PRIMARY KEY,
      menu_id INTEGER NOT NULL REFERENCES reaction_role_menus(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (menu_id, emoji)
    )
  `);
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_reaction_role_entries_menu ON reaction_role_entries(menu_id)',
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS reaction_role_entries');
  pgm.sql('DROP TABLE IF EXISTS reaction_role_menus');
};
