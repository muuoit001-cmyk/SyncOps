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
      // FIX: guard against null flag_reason arrays before unnesting
      pool.query(`SELECT flag_reason, COUNT(*)::int AS count
        FROM attendance_logs,
          unnest(COALESCE(flag_reason, ARRAY[]::text[])) AS flag_reason
        WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
          AND flag_reason IS NOT NULL AND cardinality(flag_reason) > 0
        GROUP BY flag_reason ORDER BY count DESC`, [from, to]),
      // FIX: use AT TIME ZONE with shift timezone for accurate late detection
      pool.query(`SELECT s.full_name, s.employee_id, COALESCE(si.name, 'Unassigned') AS site_name,
          al.timestamp_utc, sh.name AS shift_name, sh.start_time,
          ROUND(EXTRACT(EPOCH FROM (
            (al.timestamp_utc AT TIME ZONE COALESCE(sh.timezone, 'UTC'))::time
            - sh.start_time
            - make_interval(mins => COALESCE(sh.grace_minutes, 0))
          )) / 60)::int AS minutes_late
        FROM attendance_logs al JOIN staff s ON s.id = al.staff_id
        LEFT JOIN sites si ON si.id = al.site_id
        LEFT JOIN departments d ON d.id = s.department_id
        LEFT JOIN staff_shifts ss ON ss.staff_id = s.id
        LEFT JOIN shifts sh ON sh.id = COALESCE(ss.shift_id, d.shift_id)
        WHERE al.action = 'clock_in'
          AND al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
          AND sh.id IS NOT NULL
          AND (al.timestamp_utc AT TIME ZONE COALESCE(sh.timezone, 'UTC'))::time
            > sh.start_time + make_interval(mins => COALESCE(sh.grace_minutes, 0))
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
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE s.status = 'active'
        GROUP BY s.id, s.full_name, s.employee_id, si.name ORDER BY clock_ins DESC, s.full_name`, [from, to]),
      pool.query(`SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (out_log.timestamp_utc - in_log.timestamp_utc))/60 - COALESCE(sh.overtime_after_minutes, 480))), 0)::int AS overtime_minutes
        FROM attendance_logs in_log JOIN attendance_logs out_log ON out_log.staff_id = in_log.staff_id
          AND out_log.action = 'clock_out' AND out_log.timestamp_utc::date = in_log.timestamp_utc::date
        LEFT JOIN staff staff_member ON staff_member.id = in_log.staff_id
        LEFT JOIN departments d ON d.id = staff_member.department_id
        LEFT JOIN staff_shifts ss ON ss.staff_id = in_log.staff_id LEFT JOIN shifts sh ON sh.id = COALESCE(ss.shift_id, d.shift_id)
        WHERE in_log.action = 'clock_in' AND in_log.timestamp_utc >= $1::date AND in_log.timestamp_utc < ($2::date + 1)`, [from, to]),
    ]);

    // Leave metrics — aggregated per day and total
    let leaveDays = 0;
    let leaveByDay = new Map();
    let leaveByType = [];
    try {
      const leaveResult = await pool.query(
        `SELECT lr.starts_on, lr.ends_on, lr.days, lt.name AS leave_type_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.status = 'approved' AND lr.starts_on <= $2::date AND lr.ends_on >= $1::date`,
        [from, to]
      );
      leaveDays = leaveResult.rows.reduce((total, row) => total + Number(row.days || 0), 0);
      for (const row of leaveResult.rows) {
        const start = new Date(`${row.starts_on}T00:00:00Z`);
        const end = new Date(`${row.ends_on}T00:00:00Z`);
        for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
          const key = date.toISOString().slice(0, 10);
          leaveByDay.set(key, (leaveByDay.get(key) || 0) + 1);
        }
      }

      // Leave by type summary
      const leaveTypeResult = await pool.query(
        `SELECT lt.name AS leave_type_name, COUNT(lr.id)::int AS request_count,
           SUM(lr.days)::int AS total_days
         FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.status = 'approved' AND lr.starts_on <= $2::date AND lr.ends_on >= $1::date
         GROUP BY lt.name ORDER BY total_days DESC`,
        [from, to]
      );
      leaveByType = leaveTypeResult.rows;
    } catch (leaveErr) {
      console.warn('Leave metrics unavailable; run the leave schema migration:', leaveErr.message);
    }

    res.json({
      from, to,
      summary: { ...summary.rows[0], leave_days: leaveDays },
      daily: daily.rows.map(row => ({
        ...row,
        day: String(row.day).slice(0, 10),
        leave_count: leaveByDay.get(String(row.day).slice(0, 10)) || 0,
      })),
      sites: sites.rows,
      flags: flags.rows,
      late: late.rows,
      gps: gps.rows,
      employees: employees.rows,
      leaveByType,
      overtimeMinutes: overtime.rows[0]?.overtime_minutes || 0,
    });
  } catch (err) {
    console.error('analytics error:', err);
    res.status(500).json({ error: 'Failed to calculate analytics' });
  }
});

module.exports = router;
