const express = require('express');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

router.get('/', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  try {
    const [daily, sites, flags, overtime] = await Promise.all([
      pool.query(`SELECT (timestamp_utc AT TIME ZONE 'UTC')::date AS day,
        COUNT(*) FILTER (WHERE action = 'clock_in')::int AS clock_ins,
        COUNT(*) FILTER (WHERE action = 'clock_out')::int AS clock_outs,
        COUNT(*) FILTER (WHERE is_flagged)::int AS flagged
        FROM attendance_logs WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
        GROUP BY day ORDER BY day`, [from, to]),
      pool.query(`SELECT COALESCE(si.name, 'Unassigned') AS site_name,
        COUNT(*) FILTER (WHERE al.action = 'clock_in')::int AS clock_ins,
        COUNT(*) FILTER (WHERE al.is_flagged)::int AS flagged
        FROM attendance_logs al LEFT JOIN sites si ON si.id = al.site_id
        WHERE al.timestamp_utc >= $1::date AND al.timestamp_utc < ($2::date + 1)
        GROUP BY si.name ORDER BY clock_ins DESC`, [from, to]),
      pool.query(`SELECT flag_reason, COUNT(*)::int AS count FROM attendance_logs,
        unnest(COALESCE(flag_reason, ARRAY[]::text[])) AS flag_reason
        WHERE timestamp_utc >= $1::date AND timestamp_utc < ($2::date + 1)
        GROUP BY flag_reason ORDER BY count DESC`, [from, to]),
      pool.query(`SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (out_log.timestamp_utc - in_log.timestamp_utc))/60 - COALESCE(sh.overtime_after_minutes, 480))), 0)::int AS overtime_minutes
        FROM attendance_logs in_log JOIN attendance_logs out_log ON out_log.staff_id = in_log.staff_id
          AND out_log.action = 'clock_out' AND out_log.timestamp_utc::date = in_log.timestamp_utc::date
        LEFT JOIN staff_shifts ss ON ss.staff_id = in_log.staff_id LEFT JOIN shifts sh ON sh.id = ss.shift_id
        WHERE in_log.action = 'clock_in' AND in_log.timestamp_utc >= $1::date AND in_log.timestamp_utc < ($2::date + 1)`, [from, to]),
    ]);
    res.json({ from, to, daily: daily.rows, sites: sites.rows, flags: flags.rows, overtimeMinutes: overtime.rows[0]?.overtime_minutes || 0 });
  } catch (err) {
    console.error('analytics error:', err);
    res.status(500).json({ error: 'Failed to calculate analytics' });
  }
});

module.exports = router;
