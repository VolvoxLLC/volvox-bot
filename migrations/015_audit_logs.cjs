/**
 * Migration 015 — Audit Logs
 * Creates the audit_logs table for tracking admin actions in the web dashboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/123
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      action VARCHAR(128) NOT NULL,
      target_type VARCHAR(64),
      target_id VARCHAR(64),
      details JSONB,
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created
      ON audit_logs(guild_id, created_at DESC);
  `);
}

module.exports = { up };
