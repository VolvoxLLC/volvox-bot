/**
 * Migration 012 — Placeholder (gap filler)
 *
 * There are two migrations numbered 004 in this project:
 *   - 004_performance_indexes.cjs
 *   - 004_voice_sessions.cjs
 *
 * This no-op migration occupies the 012 slot to make the numbering sequence
 * explicit going forward. No schema changes are made here.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = async (pgm) => {
  // No-op — this migration exists only to document the sequence gap
  pgm.noTransaction();
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = async (_pgm) => {
  // Nothing to undo
};
