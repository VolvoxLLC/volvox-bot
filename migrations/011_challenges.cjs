/**
 * Migration 011 — Daily Coding Challenges
 * Creates the challenge_solves table for tracking user solve history.
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
      challenge_index INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      solved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, challenge_index, user_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_challenge_solves_guild
      ON challenge_solves(guild_id);
  `);
}

module.exports = { up };
