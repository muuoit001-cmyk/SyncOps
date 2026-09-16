-- ==============================================================================
-- SyncOps: Complete Database Schema & Demo Seed Data
-- Run this directly in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  created_by    UUID REFERENCES hr_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- ── 8. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON attendance_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_flagged ON attendance_logs(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_site_id ON staff(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_staff_id ON devices(staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_action_day
  ON attendance_logs (staff_id, action, ((timezone('UTC', timestamp_utc))::date));

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

  -- 1. Insert HR Admin user (password: admin123)
  INSERT INTO hr_users (id, email, password_hash, full_name, role)
  VALUES (
    v_hr_id,
    'admin@syncops.dev',
    '$2a$10$Y57vTgs85bG4gBsNwjra1ORYLn0Cb0GlSVPdN419RbBYQK3VrHsiK',
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
    VALUES (v_staff1_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:15:00', -1.2921, 36.8219, 6.2, 28.5, true);

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff1_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '17:05:00', -1.2921, 36.8219, 7.1, 31.0, true);

    -- Brian
    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff2_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:28:00', -1.2921, 36.8219, 8.4, 45.1, true);

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff2_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '17:15:00', -1.2921, 36.8219, 6.9, 39.4, true);

    -- Carol
    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff3_id, v_site_id, 'clock_in', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '08:42:00', -1.2921, 36.8219, 9.1, 52.0, true);

    INSERT INTO attendance_logs (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence)
    VALUES (v_staff3_id, v_site_id, 'clock_out', (v_base_date - (v_day || ' days')::INTERVAL)::DATE + TIME '16:55:00', -1.2921, 36.8219, 8.0, 48.2, true);
  END LOOP;

END $$;
