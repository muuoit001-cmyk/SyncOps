const express = require('express');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

router.get('/', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  try {
    const [summary, daily, sites, flags, late, gps, employees, overtime] = await Promise.all([
      pool.query(`WITH active AS (SELECT COUNT(*)::int AS total FROM staff WHERE status = 'active'),
        events AS (
          SELECT COUNT(*) FILTER (WHERE action = 'clock_in')::int AS clock_ins,
            COUNT(*) FILTER (WHERE action = 'clock_out')::int AS clock_outs,
            COUNT(*) FILTER (WHERE is_flagged)::int AS flagged,
            COUNT(*) FILTER (WHERE action = 'clock_in' AND is_within_fence = false)::int AS outside_fence,
            COUNT(*) FILTER (WHERE action = 'clock_in' AND is_offline_sync)::int AS offline_sync
          FROM attendance_logs WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
        ) SELECT active.total AS active_staff, events.* FROM active CROSS JOIN events`, [from, to]),
      pool.query(`WITH days AS (
          SELECT generate_series($1::date, $2::date, '1 day')::date AS day
        ), events AS (
          SELECT timestamp_utc::date AS day,
            COUNT(*) FILTER (WHERE action = 'clock_in')::int AS clock_ins,
            COUNT(*) FILTER (WHERE action = 'clock_out')::int AS clock_outs,
            COUNT(*) FILTER (WHERE action = 'clock_in' AND is_flagged)::int AS flagged,
            COUNT(*) FILTER (WHERE action = 'clock_in' AND is_within_fence = false)::int AS outside_fence
          FROM attendance_logs WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
          GROUP BY timestamp_utc::date
        ) SELECT days.day, COALESCE(events.clock_ins, 0)::int AS clock_ins,
          COALESCE(events.clock_outs, 0)::int AS clock_outs,
          COALESCE(events.flagged, 0)::int AS flagged,
          COALESCE(events.outside_fence, 0)::int AS outside_fence
        FROM days LEFT JOIN events ON events.day = days.day ORDER BY days.day`, [from, to]),
      pool.query(`SELECT COALESCE(si.name, 'Unassigned') AS site_name,
        COUNT(*) FILTER (WHERE al.action = 'clock_in')::int AS clock_ins,
        COUNT(*) FILTER (WHERE al.action = 'clock_in' AND al.is_flagged)::int AS flagged,
        COUNT(*) FILTER (WHERE al.action = 'clock_in' AND al.is_within_fence = false)::int AS outside_fence,
        COUNT(DISTINCT al.staff_id) FILTER (WHERE al.action = 'clock_in')::int AS employees_present
        FROM attendance_logs al LEFT JOIN sites si ON si.id = al.site_id
        WHERE al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
        GROUP BY si.name ORDER BY clock_ins DESC`, [from, to]),
      pool.query(`SELECT flag_reason, COUNT(*)::int AS count FROM attendance_logs,
        unnest(COALESCE(flag_reason, ARRAY[]::text[])) AS flag_reason
        WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
        GROUP BY flag_reason ORDER BY count DESC`, [from, to]),
      pool.query(`SELECT s.full_name, s.employee_id, COALESCE(si.name, 'Unassigned') AS site_name,
          al.timestamp_utc, sh.name AS shift_name, sh.start_time,
          ROUND(EXTRACT(EPOCH FROM (al.timestamp_utc::time - sh.start_time -
            make_interval(mins => COALESCE(sh.grace_minutes, 0)))) / 60)::int AS minutes_late
        FROM attendance_logs al JOIN staff s ON s.id = al.staff_id
        LEFT JOIN sites si ON si.id = al.site_id
        JOIN staff_shifts ss ON ss.staff_id = s.id
        JOIN shifts sh ON sh.id = ss.shift_id
        WHERE al.action = 'clock_in' AND al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
          AND al.timestamp_utc::time > sh.start_time + make_interval(mins => COALESCE(sh.grace_minutes, 0))
        ORDER BY al.timestamp_utc DESC LIMIT 100`, [from, to]),
      pool.query(`SELECT s.full_name, s.employee_id, COALESCE(si.name, 'Unassigned') AS site_name,
          al.action, al.timestamp_utc, al.lat, al.lng, al.gps_accuracy_m,
          al.distance_from_site_m, al.is_within_fence, al.is_offline_sync
        FROM attendance_logs al JOIN staff s ON s.id = al.staff_id
        LEFT JOIN sites si ON si.id = al.site_id
        WHERE al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
        ORDER BY al.timestamp_utc DESC LIMIT 100`, [from, to]),
      pool.query(`SELECT s.full_name, s.employee_id, COALESCE(si.name, 'Unassigned') AS site_name,
          COUNT(*) FILTER (WHERE al.action = 'clock_in')::int AS clock_ins,
          COUNT(*) FILTER (WHERE al.action = 'clock_out')::int AS clock_outs,
          COUNT(*) FILTER (WHERE al.is_flagged)::int AS flagged,
          COUNT(*) FILTER (WHERE al.action = 'clock_in' AND al.is_within_fence = false)::int AS outside_fence
        FROM staff s LEFT JOIN attendance_logs al ON al.staff_id = s.id
          AND al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
        LEFT JOIN sites si ON si.id = s.site_id
        WHERE s.status = 'active'
        GROUP BY s.id, s.full_name, s.employee_id, si.name ORDER BY clock_ins DESC, s.full_name`, [from, to]),
      pool.query(`SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (out_log.timestamp_utc - in_log.timestamp_utc))/60 - COALESCE(sh.overtime_after_minutes, 480))), 0)::int AS overtime_minutes
        FROM attendance_logs in_log JOIN attendance_logs out_log ON out_log.staff_id = in_log.staff_id
          AND out_log.action = 'clock_out' AND out_log.timestamp_utc::date = in_log.timestamp_utc::date
        LEFT JOIN staff_shifts ss ON ss.staff_id = in_log.staff_id LEFT JOIN shifts sh ON sh.id = ss.shift_id
        WHERE in_log.action = 'clock_in' AND in_log.timestamp_utc >= $1::date AND in_log.timestamp_utc < ($2::date + 1)`, [from, to]),
    ]);
    res.json({
      from, to, summary: summary.rows[0], daily: daily.rows, sites: sites.rows,
      flags: flags.rows, late: late.rows, gps: gps.rows, employees: employees.rows,
      overtimeMinutes: overtime.rows[0]?.overtime_minutes || 0,
    });
  } catch (err) {
    console.error('analytics error:', err);
    res.status(500).json({ error: 'Failed to calculate analytics' });
  }
});

module.exports = router;
