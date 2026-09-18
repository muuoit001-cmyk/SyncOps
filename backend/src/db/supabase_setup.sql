-- ==============================================================================
-- SyncOps: Complete Database Schema & Demo Seed Data
-- Run this directly in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. HR Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'hr_manager',
  totp_secret   VARCHAR(255),
  totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  auth_user_id  UUID,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Sites ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(255) NOT NULL,
  address        TEXT,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  radius_meters  INTEGER NOT NULL DEFAULT 100,
  polygon_coordinates JSONB,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES hr_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Staff ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   VARCHAR(100) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(50),
  site_id       UUID REFERENCES sites(id),
  status        VARCHAR(50) NOT NULL DEFAULT 'active',
  enrolled_at   TIMESTAMPTZ,
  enrollment_code_hash TEXT,
  enrollment_code_expires_at TIMESTAMPTZ,
  enrollment_code_used_at TIMESTAMPTZ,
  created_by    UUID REFERENCES hr_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3b. Organization ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(150) NOT NULL UNIQUE,
  code VARCHAR(32) NOT NULL UNIQUE, description TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES hr_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(150) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE, department_id UUID REFERENCES departments(id), site_id UUID REFERENCES sites(id),
  leader_staff_id UUID REFERENCES staff(id), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES hr_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Devices ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  device_label  VARCHAR(255),
  platform      VARCHAR(50),
  public_key_b64 TEXT,
  device_token  VARCHAR(500) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

-- ── 5. Attendance Logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  site_id         UUID REFERENCES sites(id),
  device_id       UUID REFERENCES devices(id),
  action          VARCHAR(20) NOT NULL,
  timestamp_utc   TIMESTAMPTZ NOT NULL,
  client_time_utc TIMESTAMPTZ,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  gps_accuracy_m  DOUBLE PRECISION,
  distance_from_site_m DOUBLE PRECISION,
  is_within_fence BOOLEAN NOT NULL DEFAULT TRUE,
  is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason     TEXT[],
  is_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  is_accepted     BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by     UUID REFERENCES hr_users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Offline Queue ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_queue (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id   UUID REFERENCES devices(id),
  staff_id    UUID REFERENCES staff(id),
  payload     JSONB NOT NULL,
  queued_at   TIMESTAMPTZ NOT NULL,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_id      UUID REFERENCES attendance_logs(id)
);

-- ── 7. Refresh Tokens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES hr_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id),
  ADD COLUMN IF NOT EXISTS manager_staff_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS role_title VARCHAR(150),
  ADD COLUMN IF NOT EXISTS date_joined DATE;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE staff_shifts
  ADD COLUMN IF NOT EXISTS effective_to DATE;

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(32) NOT NULL UNIQUE, days_per_year NUMERIC(6,2) NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id), starts_on DATE NOT NULL, ends_on DATE NOT NULL,
  days NUMERIC(6,2) NOT NULL, reason TEXT, status VARCHAR(32) NOT NULL DEFAULT 'pending_manager',
  reviewed_by UUID REFERENCES hr_users(id), reviewed_at TIMESTAMPTZ,
  manager_approved_by UUID REFERENCES staff(id), manager_approved_at TIMESTAMPTZ,
  hr_approved_by UUID REFERENCES hr_users(id), hr_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on >= starts_on), CHECK (status IN ('pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS leave_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size INTEGER,
  content_base64 TEXT NOT NULL,
  uploaded_by_staff_id UUID REFERENCES staff(id),
  uploaded_by_user_id UUID REFERENCES hr_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO leave_types (id, name, code, days_per_year)
VALUES
  (uuid_generate_v4(), 'Annual Leave', 'ANNUAL', 21),
  (uuid_generate_v4(), 'Sick Leave', 'SICK', 14)
ON CONFLICT (code) DO NOTHING;

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

-- Additive migrations for databases where the tables already existed.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS polygon_coordinates JSONB;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS enrollment_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrollment_code_used_at TIMESTAMPTZ;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 8. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON attendance_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_flagged ON attendance_logs(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_site_id ON staff(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_staff_id ON devices(staff_id);

-- Preserve historical duplicates but allow only one accepted clock action
-- per staff, action, and UTC day going forward.
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
WHERE logs.id = ranked.id
  AND ranked.row_number > 1;

DROP INDEX IF EXISTS idx_attendance_staff_action_day;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_action_day
  ON attendance_logs (staff_id, action, ((timezone('UTC', timestamp_utc))::date))
  WHERE is_accepted = TRUE;

-- ── 9. Triggers ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_users_updated_at ON hr_users;
CREATE TRIGGER trg_hr_users_updated_at
  BEFORE UPDATE ON hr_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites;
CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_staff_updated_at ON staff;
CREATE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ==============================================================================
-- DEMO SEED DATA
-- ==============================================================================

DO $$
DECLARE
  v_admin_email TEXT := current_setting('app.syncops_admin_email', true);
  v_admin_password TEXT := current_setting('app.syncops_admin_password', true);
  v_hr_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_site_id UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;
  v_staff1_id UUID := 'c0000000-0000-0000-0000-000000000001'::UUID;
  v_staff2_id UUID := 'c0000000-0000-0000-0000-000000000002'::UUID;
  v_staff3_id UUID := 'c0000000-0000-0000-0000-000000000003'::UUID;
  v_staff4_id UUID := 'c0000000-0000-0000-0000-000000000004'::UUID;
  v_staff5_id UUID := 'c0000000-0000-0000-0000-000000000005'::UUID;
  v_day INT;
  v_base_date TIMESTAMPTZ := NOW();
BEGIN

  IF COALESCE(v_admin_email, '') = '' OR COALESCE(v_admin_password, '') = '' OR length(v_admin_password) < 12 THEN
    RAISE NOTICE 'Schema setup completed. Demo seed data was skipped because strong admin credentials were not supplied.';
  ELSE

  -- 1. Insert HR Admin user using the operator-provided session credentials
  INSERT INTO hr_users (id, email, password_hash, full_name, role)
  VALUES (
    v_hr_id,
    v_admin_email,
    crypt(v_admin_password, gen_salt('bf', 12)),
    'SyncOps Admin',
    'hr_admin'
  )
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

  -- 2. Insert HQ Site
  INSERT INTO sites (id, name, address, lat, lng, radius_meters, created_by)
  VALUES (
    v_site_id,
    'HQ Office',
    '123 Main Street, Nairobi',
    -1.2921,
    36.8219,
    150,
    v_hr_id
  )
  ON CONFLICT DO NOTHING;

  -- 3. Insert Staff
  INSERT INTO staff (id, employee_id, full_name, email, site_id, created_by)
  VALUES
    (v_staff1_id, 'EMP-001', 'Alice Kamau', 'alice@example.com', v_site_id, v_hr_id),
    (v_staff2_id, 'EMP-002', 'Brian Odhiambo', 'brian@example.com', v_site_id, v_hr_id),
    (v_staff3_id, 'EMP-003', 'Carol Wanjiku', 'carol@example.com', v_site_id, v_hr_id),
    (v_staff4_id, 'EMP-004', 'David Mutua', 'david@example.com', v_site_id, v_hr_id),
    (v_staff5_id, 'EMP-005', 'Eva Njoroge', 'eva@example.com', v_site_id, v_hr_id)
  ON CONFLICT (employee_id) DO NOTHING;

  -- 4. Seed attendance logs for past 7 days
  FOR v_day IN 0..6 LOOP
    -- Alice
    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff1_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:15:00', -1.2921, 36.8219, 6.2, 28.5, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff1_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '17:05:00', -1.2921, 36.8219, 7.1, 31.0, true)
    ON CONFLICT DO NOTHING;

    -- Brian
    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff2_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:28:00', -1.2921, 36.8219, 8.4, 45.1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff2_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '17:15:00', -1.2921, 36.8219, 6.9, 39.4, true)
    ON CONFLICT DO NOTHING;

    -- Carol
    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff3_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:42:00', -1.2921, 36.8219, 9.1, 52.0, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff3_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '16:55:00', -1.2921, 36.8219, 8.0, 48.2, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
  END IF;

END $$;
