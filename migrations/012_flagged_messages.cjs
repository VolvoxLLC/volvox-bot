/**
 * Migration 012 — Flagged Messages
 * Creates the flagged_messages table for tracking problematic AI responses
 * within conversation threads.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/34
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flagged_messages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      conversation_first_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL REFERENCES conversations(id),
      flagged_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_flagged_messages_guild
      ON flagged_messages(guild_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_flagged_messages_status
      ON flagged_messages(guild_id, status);
  `);
}

module.exports = { up };
