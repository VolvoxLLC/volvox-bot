/**
 * Migration 012 — Placeholder (sequence alignment)
 *
 * Background:
 *   Two migrations share the `004` prefix:
 *     - 004_performance_indexes.cjs
 *     - 004_voice_sessions.cjs
 *
 *   This occurred when voice sessions were added concurrently with performance
 *   indexes. Both ran in production in alphabetical order (performance_indexes
 *   before voice_sessions) and are tracked in the pgmigrations table.
 *
 *   Later, four other files that originally had the `004` prefix were renumbered
 *   to 007–010 to fix an out-of-order conflict on production databases that had
 *   already applied the two original `004_*` migrations.
 *
 * Purpose:
 *   This no-op migration occupies slot 012 to keep the numbering sequence
 *   monotonically increasing from this point forward (next: 013, 014, …).
 *   It also serves as documentation so future contributors understand why
 *   the numbering is not perfectly sequential from 001–011.
 *
 * Safe to run on any environment — it performs no schema changes.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = async (_pgm) => {
  // No-op — sequence alignment placeholder
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = async (_pgm) => {
  // Nothing to undo
};
