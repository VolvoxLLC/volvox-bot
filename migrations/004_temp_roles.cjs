/**
 * Migration: Temporary Role Assignments
 *
 * Creates the temp_roles table to track roles assigned with an expiry.
 * The scheduler polls this table and removes roles when they expire.
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS temp_roles (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT NOT NULL,
      reason TEXT,
      duration TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      removed BOOLEAN NOT NULL DEFAULT FALSE,
      removed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_temp_roles_guild ON temp_roles(guild_id)');
  pgm.sql(
    "CREATE INDEX IF NOT EXISTS idx_temp_roles_pending ON temp_roles(removed, expires_at) WHERE removed = FALSE",
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_temp_roles_guild_user ON temp_roles(guild_id, user_id, removed)',
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS temp_roles CASCADE');
};
