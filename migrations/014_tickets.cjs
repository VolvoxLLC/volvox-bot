/**
 * Migration 014 — Tickets
 * Creates the tickets table for the support ticket system.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      topic TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      thread_id TEXT NOT NULL,
      channel_id TEXT,
      closed_by TEXT,
      close_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      transcript JSONB
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_status
      ON tickets(guild_id, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_user
      ON tickets(guild_id, user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_thread_status
      ON tickets(thread_id, status);
  `);
}

module.exports = { up };
