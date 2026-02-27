/**
 * Migration 010 — Code Review Requests
 * Creates the reviews table for the /review command.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/49
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      reviewer_id TEXT,
      url TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT,
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'completed', 'stale')),
      message_id TEXT,
      channel_id TEXT,
      thread_id TEXT,
      feedback TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_guild ON reviews(guild_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(guild_id, status);
  `);
}

/**
 * @param {import('pg').Pool} pool
 */
async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS idx_reviews_status;
    DROP INDEX IF EXISTS idx_reviews_guild;
    DROP TABLE IF EXISTS reviews;
  `);
}

module.exports = { up, down };
