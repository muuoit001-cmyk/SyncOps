-- SyncOps Database Schema
-- Run: psql -U postgres -d syncops -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── HR Users (dashboard accounts) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'hr_manager', -- hr_admin | hr_manager
  totp_secret   VARCHAR(255),          -- null = 2FA not enabled
  totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  auth_user_id  UUID,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sites (work locations with geofences) ──────────────────────────────────
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

-- ── Staff (field employees) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   VARCHAR(100) UNIQUE NOT NULL,  -- HR-assigned code (e.g. EMP-001)
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(50),
  site_id       UUID REFERENCES sites(id),
  status        VARCHAR(50) NOT NULL DEFAULT 'active', -- active | inactive | suspended
  enrolled_at   TIMESTAMPTZ,             -- null = not yet enrolled on any device
  enrollment_code_hash TEXT,
  enrollment_code_expires_at TIMESTAMPTZ,
  enrollment_code_used_at TIMESTAMPTZ,
  created_by    UUID REFERENCES hr_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Enrolled Devices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  device_label  VARCHAR(255),           -- e.g. "John's iPhone 15"
  platform      VARCHAR(50),            -- ios | android
  public_key_b64 TEXT,                  -- base64 public key (v2: WebAuthn)
  device_token  VARCHAR(500) NOT NULL,  -- HMAC signing secret (MVP)
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

-- ── Attendance Logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  site_id         UUID REFERENCES sites(id),
  device_id       UUID REFERENCES devices(id),
  action          VARCHAR(20) NOT NULL, -- clock_in | clock_out
  timestamp_utc   TIMESTAMPTZ NOT NULL, -- SERVER time (authoritative)
  client_time_utc TIMESTAMPTZ,          -- client-reported time (for comparison/offline detection)
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  gps_accuracy_m  DOUBLE PRECISION,
  distance_from_site_m DOUBLE PRECISION,
  is_within_fence BOOLEAN NOT NULL DEFAULT TRUE,
  is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason     TEXT[],               -- array of flag reasons
  is_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  is_accepted     BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by     UUID REFERENCES hr_users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Offline Queue (server-side record of synced offline actions) ────────────
CREATE TABLE IF NOT EXISTS offline_queue (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id   UUID REFERENCES devices(id),
  staff_id    UUID REFERENCES staff(id),
  payload     JSONB NOT NULL,
  queued_at   TIMESTAMPTZ NOT NULL,  -- time of attempt on device
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_id      UUID REFERENCES attendance_logs(id)  -- created attendance log
);

-- ── Refresh Tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES hr_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_after_minutes INTEGER NOT NULL DEFAULT 480,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES hr_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  staff_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS notification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  user_id UUID REFERENCES hr_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES hr_users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON attendance_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_flagged ON attendance_logs(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_site_id ON staff(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_staff_id ON devices(staff_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_action_day
  ON attendance_logs (staff_id, action, ((timezone('UTC', timestamp_utc))::date))
  WHERE is_accepted = TRUE;

-- ── Updated-at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_hr_users_updated_at
  BEFORE UPDATE ON hr_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
