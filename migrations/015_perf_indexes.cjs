/**
 * Migration 015: Additional Performance Indexes
 *
 * Adds a missing composite index that accelerates the warn-escalation query
 * in warningEngine.js:
 *
 *   mod_cases(guild_id, target_id, action, created_at DESC)
 *
 * The existing idx_mod_cases_guild_target covers (guild_id, target_id,
 * created_at) but does not include `action`, so the `AND action = 'warn'`
 * predicate in the fallback warning-count query is evaluated as a post-scan
 * filter.  Adding `action` as the third column lets Postgres resolve the
 * entire predicate within the index, eliminating the table-heap access for
 * non-matching rows.
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // mod_cases: composite for warn-escalation fallback query
  // warningEngine.js: WHERE guild_id=$1 AND target_id=$2 AND action='warn' AND created_at>...
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_target_action
    ON mod_cases(guild_id, target_id, action, created_at DESC)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_mod_cases_guild_target_action`);
};
