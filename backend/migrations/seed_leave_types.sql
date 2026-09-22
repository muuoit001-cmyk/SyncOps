-- ============================================================
-- SyncOps: Leave Types Seed Migration (v2 — handles existing table)
-- Safe to re-run at any time.
-- ============================================================

-- Ensure the leave_types table exists (in case it hasn't been created yet)
CREATE TABLE IF NOT EXISTS leave_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  days_per_year NUMERIC(5,1) NOT NULL DEFAULT 21,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add optional columns if they don't already exist
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_paid      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_doc BOOLEAN NOT NULL DEFAULT false;

-- Add reviewer_notes to leave_requests if not already there
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;

-- Seed standard leave types (safe to re-run — skips on duplicate code)
INSERT INTO leave_types (name, code, days_per_year, is_paid, requires_doc) VALUES
  ('Annual Leave',        'ANNUAL',        21,  true,  false),
  ('Sick Leave',          'SICK',          10,  true,  true),
  ('Maternity Leave',     'MATERNITY',     90,  true,  true),
  ('Paternity Leave',     'PATERNITY',     14,  true,  true),
  ('Compassionate Leave', 'COMPASSIONATE',  5,  true,  false),
  ('Study Leave',         'STUDY',         10,  true,  true),
  ('Unpaid Leave',        'UNPAID',         0,  false, false)
ON CONFLICT (code) DO NOTHING;

-- Confirm what's in the table
SELECT name, code, days_per_year, is_paid, requires_doc
FROM leave_types
ORDER BY name;
