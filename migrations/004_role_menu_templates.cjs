/**
 * Migration: Role Menu Templates
 *
 * Stores reusable role menu templates — both built-in (is_builtin=true) and
 * custom guild-created templates.  Shared templates (is_shared=true) are
 * visible to every guild.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS role_menu_templates (
      id            SERIAL PRIMARY KEY,
      name          TEXT        NOT NULL,
      description   TEXT,
      category      TEXT        NOT NULL DEFAULT 'custom',
      created_by_guild_id TEXT,
      is_builtin    BOOLEAN     NOT NULL DEFAULT FALSE,
      is_shared     BOOLEAN     NOT NULL DEFAULT FALSE,
      options       JSONB       NOT NULL DEFAULT '[]',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rmt_name_guild
      ON role_menu_templates (name, COALESCE(created_by_guild_id, '__builtin__'))
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_rmt_guild
      ON role_menu_templates (created_by_guild_id)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_rmt_shared
      ON role_menu_templates (is_shared) WHERE is_shared = TRUE
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS role_menu_templates CASCADE');
};
