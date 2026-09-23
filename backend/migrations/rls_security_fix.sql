-- ==============================================================================
-- SyncOps: Row-Level Security (RLS) Fix
-- Resolves Supabase Security Advisories:
--   • rls_disabled_in_public     — Tables accessible to anyone without RLS
--   • sensitive_columns_exposed  — Sensitive data (password_hash, totp_secret,
--                                  token_hash, etc.) accessible via anon API key
--
-- SAFE TO RE-RUN — all statements are idempotent.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste & Run
--
-- ARCHITECTURE NOTE:
--   The Node.js backend connects with the service_role key, which bypasses RLS
--   entirely. These policies therefore only restrict direct PostgREST/REST API
--   calls made with the anon or authenticated keys.
-- ==============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: a reusable function that creates standard deny-all + service_role
--         passthrough policies for a given table.
--         Calling it multiple times is safe (DROP IF EXISTS before CREATE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _syncops_apply_rls(tbl TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Enable RLS
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

  -- 2. Force RLS even for table owner (prevents accidental owner bypass)
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

  -- 3. Drop existing auto-generated policies so we own them explicitly
  --    (safe: DROP IF EXISTS)
  EXECUTE format(
    'DROP POLICY IF EXISTS syncops_deny_anon ON %I', tbl
  );
  EXECUTE format(
    'DROP POLICY IF EXISTS syncops_service_role_all ON %I', tbl
  );

  -- 4. Deny-all for anon role (unauthenticated PostgREST calls)
  --    Returns no rows on SELECT, and blocks INSERT/UPDATE/DELETE.
  EXECUTE format($p$
    CREATE POLICY syncops_deny_anon
      ON %I
      AS RESTRICTIVE
      FOR ALL
      TO anon
      USING (false)
      WITH CHECK (false)
  $p$, tbl);

  -- 5. Full passthrough for service_role (used by the Node.js backend)
  EXECUTE format($p$
    CREATE POLICY syncops_service_role_all
      ON %I
      AS PERMISSIVE
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
  $p$, tbl);

END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Apply RLS to every table in the public schema
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. HR Users — contains password_hash, totp_secret (MOST SENSITIVE)
SELECT _syncops_apply_rls('hr_users');

-- 2. Sites
SELECT _syncops_apply_rls('sites');

-- 3. Staff — contains enrollment_code_hash, PII (email, phone)
SELECT _syncops_apply_rls('staff');

-- 4. Departments
SELECT _syncops_apply_rls('departments');

-- 5. Teams
SELECT _syncops_apply_rls('teams');

-- 6. Devices — contains public_key_b64, device_token
SELECT _syncops_apply_rls('devices');

-- 7. Attendance Logs — contains GPS coordinates and presence data
SELECT _syncops_apply_rls('attendance_logs');

-- 8. Offline Queue — contains raw payload JSONB
SELECT _syncops_apply_rls('offline_queue');

-- 9. Refresh Tokens — contains token_hash (session security)
SELECT _syncops_apply_rls('refresh_tokens');

-- 10. Shifts
SELECT _syncops_apply_rls('shifts');

-- 11. Staff Shifts
SELECT _syncops_apply_rls('staff_shifts');

-- 12. Leave Types
SELECT _syncops_apply_rls('leave_types');

-- 13. Leave Requests — contains reason, leave status (HR-sensitive)
SELECT _syncops_apply_rls('leave_requests');

-- 14. Leave Documents — contains content_base64 (uploaded documents)
SELECT _syncops_apply_rls('leave_documents');

-- 15. Notification Tokens — contains push notification tokens
SELECT _syncops_apply_rls('notification_tokens');

-- 16. Notifications
SELECT _syncops_apply_rls('notifications');


-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup: drop the helper function — it is no longer needed
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS _syncops_apply_rls(TEXT);


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query
-- Run this block after the migration to confirm RLS is enabled on all tables.
-- Expected: every row shows  rls_enabled = true
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  schemaname,
  tablename,
  rowsecurity  AS rls_enabled,
  (
    SELECT COUNT(*)
    FROM pg_policies p
    WHERE p.schemaname = c.schemaname
      AND p.tablename  = c.tablename
  )            AS policy_count
FROM pg_tables c
WHERE schemaname = 'public'
  AND tablename IN (
    'hr_users', 'sites', 'staff', 'departments', 'teams',
    'devices', 'attendance_logs', 'offline_queue', 'refresh_tokens',
    'shifts', 'staff_shifts', 'leave_types', 'leave_requests',
    'leave_documents', 'notification_tokens', 'notifications'
  )
ORDER BY tablename;
