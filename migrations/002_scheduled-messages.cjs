/**
 * Add scheduled_messages table for /announce command.
 * Supports one-time and recurring (cron) scheduled messages.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/42
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embed_json JSONB,
      cron_expression TEXT,
      next_run TIMESTAMPTZ NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      author_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      one_time BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_scheduled_next_run ON scheduled_messages(next_run) WHERE enabled = true',
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS scheduled_messages CASCADE');
};
