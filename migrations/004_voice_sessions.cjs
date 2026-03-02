/**
 * Migration 004: Voice Sessions Table
 *
 * Tracks voice channel activity for engagement metrics.
 * Records join/leave/move events with duration.
 * Gated behind voice.enabled in config (opt-in per guild).
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      CONSTRAINT chk_duration_nonneg CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild_user
    ON voice_sessions(guild_id, user_id)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild_joined
    ON voice_sessions(guild_id, joined_at)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_open
    ON voice_sessions(guild_id, user_id)
    WHERE left_at IS NULL
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_voice_sessions_open`);
  pgm.sql(`DROP INDEX IF EXISTS idx_voice_sessions_guild_joined`);
  pgm.sql(`DROP INDEX IF EXISTS idx_voice_sessions_guild_user`);
  pgm.sql(`DROP TABLE IF EXISTS voice_sessions`);
};
