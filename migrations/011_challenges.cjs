/**
 * Migration 011 — Daily Coding Challenges
 * Creates the challenge_solves table for tracking user solve history.
 *
 * Uses challenge_date (DATE) as part of the PK so users can re-solve the same
 * challenge index when the cycle repeats on a different day. This also enables
 * simple date-based consecutive-day streak calculation.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/52
 */

'use strict';

/**
 * @param {import('pg').Pool} pool
 */
async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_solves (
      guild_id TEXT NOT NULL,
      challenge_date DATE NOT NULL,
      challenge_index INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      solved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, challenge_date, user_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_challenge_solves_guild
      ON challenge_solves(guild_id);
  `);
}

module.exports = { up };
