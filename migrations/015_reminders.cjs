/**
 * Migration 015 — Reminders
 * Creates the reminders table for the personal reminder system.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR NOT NULL,
      user_id VARCHAR NOT NULL,
      channel_id VARCHAR NOT NULL,
      message TEXT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      recurring_cron VARCHAR,
      snoozed_count INT NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders(remind_at) WHERE completed = false;
  `);
}

module.exports = { up };
