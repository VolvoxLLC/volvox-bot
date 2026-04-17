/**
 * Migration 004: Performance Indexes
 *
 * STATUS: Placeholder / No-op
 *
 * PURPOSE:
 * This file exists as a migration placeholder because migration 004 was originally
 * intended to add performance indexes to the database, but those indexes were
 * instead merged into migration 001_initial-schema.cjs to maintain atomic schema
 * initialization.
 *
 * ENVIRONMENT HISTORY:
 * - Development: Never applied (used this placeholder)
 * - Staging: Never applied (used this placeholder)
 * - Production: This placeholder was present but no operational indexes were created
 *   under this migration number. All performance indexes exist in 001_initial-schema.
 *
 * CLEANUP CRITERIA FOR SAFE REMOVAL:
 * 1. Verify no production/staging database has migration 004 recorded in schema_migrations
 * 2. Confirm all required performance indexes exist (run: SELECT indexname FROM pg_indexes
 *    WHERE schemaname = 'public' AND indexname LIKE '%performance%' OR indexname LIKE '%idx_%')
 * 3. Ensure no external tooling or documentation references migration 004 by number
 * 4. All environments must be running the merged schema (001) with indexes present
 *
 * RESPONSIBLE OWNER: @volvox/core
 * REVIEW DATE: Before next major release (v3.0)
 * CREATED: 2024-Q1
 *
 * To execute actual index creation when needed, move the DDL from 001_initial-schema
 * into this file's `up` function and remove this header comment.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // No-op: Indexes already present in 001_initial-schema
};

exports.down = (pgm) => {
  // No-op: Index removal not planned
};
