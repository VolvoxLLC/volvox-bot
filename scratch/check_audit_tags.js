import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Fetches the latest five entries from the `audit_logs` table and prints them as formatted JSON.
 *
 * Logs any encountered error to stderr and ensures the database connection pool is closed before returning.
 */
async function check() {
  try {
    const res = await pool.query("SELECT id, action, target_id, target_tag FROM audit_logs ORDER BY created_at DESC LIMIT 5");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
