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
    ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS polygon_coordinates JSONB;
  `);

  await pool.query(`
    ALTER TABLE staff
      ADD COLUMN IF NOT EXISTS enrollment_code_hash TEXT,
      ADD COLUMN IF NOT EXISTS enrollment_code_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS enrollment_code_used_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE attendance_logs
      ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL,
      start_time TIME NOT NULL, end_time TIME NOT NULL, timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
      grace_minutes INTEGER NOT NULL DEFAULT 0, overtime_after_minutes INTEGER NOT NULL DEFAULT 480,
      is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by UUID REFERENCES hr_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS staff_shifts (
      staff_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
      shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE
    );
    CREATE TABLE IF NOT EXISTS notification_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
      user_id UUID REFERENCES hr_users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE,
      platform VARCHAR(32) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID REFERENCES hr_users(id) ON DELETE CASCADE,
      staff_id UUID REFERENCES staff(id) ON DELETE CASCADE, type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL, body TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_users_auth_user_id
      ON hr_users (auth_user_id)
      WHERE auth_user_id IS NOT NULL;
  `);

  try {
    await pool.query(`
      WITH ranked_attendance AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY staff_id, action, (timezone('UTC', timestamp_utc))::date
                 ORDER BY timestamp_utc DESC, created_at DESC, id DESC
               ) AS row_number
        FROM attendance_logs
        WHERE is_accepted = TRUE
      )
      UPDATE attendance_logs AS logs
      SET is_accepted = FALSE,
          is_flagged = TRUE,
          flag_reason = array_append(COALESCE(logs.flag_reason, ARRAY[]::TEXT[]), 'duplicate_daily_action')
      FROM ranked_attendance AS ranked
      WHERE logs.id = ranked.id AND ranked.row_number > 1;

      DROP INDEX IF EXISTS idx_attendance_staff_action_day;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_action_day
        ON attendance_logs (
          staff_id,
          action,
          ((timezone('UTC', timestamp_utc))::date)
        )
        WHERE is_accepted = TRUE;
    `);
  } catch (err) {
    console.warn('Could not add unique daily attendance index:', err.message);
  }
}

module.exports = { ensureSchema };
