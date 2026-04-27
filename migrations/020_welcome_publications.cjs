'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // CHECK constraints intentionally mirror the current welcome panel/status sets.
  // Add a follow-up ALTER TABLE migration if those sets expand.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS welcome_publications (
      guild_id TEXT NOT NULL,
      panel_type TEXT NOT NULL CHECK (panel_type IN ('rules', 'role_menu')),
      channel_id TEXT,
      message_id TEXT,
      config_hash TEXT,
      status TEXT NOT NULL DEFAULT 'missing'
        CHECK (status IN ('missing', 'posted', 'failed', 'unconfigured')),
      last_published_at TIMESTAMPTZ,
      last_error TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, panel_type)
    )
  `);
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_welcome_publications_guild ON welcome_publications(guild_id)',
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_welcome_publications_message ON welcome_publications(message_id) WHERE message_id IS NOT NULL',
  );
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS welcome_publications');
};
