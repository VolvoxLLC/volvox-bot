/**
 * Migration: Comprehensive Warning System
 *
 * Adds a dedicated `warnings` table that tracks individual warnings with
 * severity, points, expiry (auto-removal after a configurable period),
 * and decay (points reduce over time). Warnings reference the parent
 * mod_case for traceability.
 *
 * Also adds an index on mod_cases for active-warning escalation queries.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── warnings table ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS warnings (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT NOT NULL,
      reason TEXT,
      severity TEXT NOT NULL DEFAULT 'low'
        CHECK (severity IN ('low', 'medium', 'high')),
      points INTEGER NOT NULL DEFAULT 1,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      removed_at TIMESTAMPTZ,
      removed_by TEXT,
      removal_reason TEXT,
      case_id INTEGER REFERENCES mod_cases(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Fast lookup: all warnings for a user in a guild
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id, created_at DESC)',
  );

  // Fast lookup: active warnings only (for escalation + /warnings display)
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_warnings_active ON warnings(guild_id, user_id) WHERE active = TRUE',
  );

  // Expiry polling: find warnings that need to be deactivated
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_warnings_expires ON warnings(expires_at) WHERE active = TRUE AND expires_at IS NOT NULL',
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS warnings CASCADE');
};
