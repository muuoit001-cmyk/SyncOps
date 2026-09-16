const pool = require('./pool');

/**
 * Applies additive schema updates on boot so production DBs stay in sync
 * without a separate migration runner.
 */
async function ensureSchema() {
  await pool.query(`
    ALTER TABLE hr_users
      ADD COLUMN IF NOT EXISTS auth_user_id UUID;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_users_auth_user_id
      ON hr_users (auth_user_id)
      WHERE auth_user_id IS NOT NULL;
  `);

  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_action_day
        ON attendance_logs (
          staff_id,
          action,
          ((timezone('UTC', timestamp_utc))::date)
        );
    `);
  } catch (err) {
    console.warn('Could not add unique daily attendance index:', err.message);
  }
}

module.exports = { ensureSchema };
