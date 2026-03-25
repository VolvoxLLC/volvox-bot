/**
 * Repair migration for audit_logs schema drift.
 *
 * Background:
 *   `013_audit_log.cjs` now creates `audit_logs.user_tag`, but some databases
 *   already had an older `audit_logs` table from `001_initial-schema.cjs`.
 *   Because `013_audit_log.cjs` uses `ifNotExists`, those existing tables do
 *   not receive the new column automatically.
 *
 * Purpose:
 *   Preserve the historical `014_*` slot already recorded in some databases
 *   and backfill the missing column/index when needed.
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS audit_logs
    ADD COLUMN IF NOT EXISTS user_tag VARCHAR(100)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_user
    ON audit_logs(guild_id, user_id)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS audit_logs
    DROP COLUMN IF EXISTS user_tag
  `);
};
