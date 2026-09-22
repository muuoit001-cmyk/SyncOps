const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');
const { deviceAuth } = require('../middleware/deviceAuth');
const { isWithinFence } = require('../utils/geo');
const { evaluateFraudSignals } = require('../utils/fraud');

const router = express.Router();

const MAX_LEAVE_DOCUMENT_BYTES = 8 * 1024 * 1024;

function validateLeaveDocument(document) {
  if (!document || typeof document !== 'object') return 'Document is required';
  if (!document.file_name || !document.mime_type || !document.content_base64) return 'Document name, type, and content are required';
  const size = Number(document.file_size || Math.floor(String(document.content_base64).length * 0.75));
  if (!Number.isFinite(size) || size < 1 || size > MAX_LEAVE_DOCUMENT_BYTES) return 'Document must be smaller than 8 MB';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE ENDPOINTS (device-authenticated)
// ═══════════════════════════════════════════════════════════════════════════
// ── GET /api/attendance/today-status (mobile — check today's status) ───────
router.get('/today-status', deviceAuth, async (req, res) => {
  try {
    const { rows: leaveRows } = await pool.query(
      `SELECT lr.id, lt.name AS leave_type_name, lr.starts_on, lr.ends_on
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.staff_id = $1 AND lr.status = 'approved'
         AND (timezone('UTC', NOW()))::date BETWEEN lr.starts_on AND lr.ends_on
       LIMIT 1`,
      [req.staffMember.id]
    );
    const { rows } = await pool.query(
      `SELECT action, timestamp_utc FROM attendance_logs
       WHERE staff_id = $1
        AND is_accepted = true
         AND (timezone('UTC', timestamp_utc))::date = (timezone('UTC', NOW()))::date
       ORDER BY timestamp_utc ASC`,
      [req.staffMember.id]
    );
    const hasClockIn = rows.some(r => r.action === 'clock_in');
    const hasClockOut = rows.some(r => r.action === 'clock_out');
    res.json({
      hasClockIn,
      hasClockOut,
      isComplete: hasClockIn && hasClockOut,
      nextAction: !hasClockIn ? 'clock_in' : (!hasClockOut ? 'clock_out' : null),
      onLeave: leaveRows.length > 0,
      leave: leaveRows[0] || null,
      todayLogs: rows,
    });
  } catch (err) {
    console.error('today-status error:', err);
    res.status(500).json({ error: 'Failed to fetch today status' });
  }
});

// ── POST /api/attendance/clock  (the critical path — must be fast) ─────────
router.post('/clock', deviceAuth, async (req, res) => {
  const { action, lat, lng, gps_accuracy_m, is_mock_location, client_time_utc, is_offline_sync, queued_at } = req.body;

  if (!['clock_in', 'clock_out'].includes(action)) {
    return res.status(400).json({ error: 'action must be clock_in or clock_out' });
  }

  const serverTime = new Date();

  try {
    const { rows: leaveRows } = await pool.query(
      `SELECT lt.name AS leave_type_name FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.staff_id = $1 AND lr.status = 'approved'
         AND (timezone('UTC', NOW()))::date BETWEEN lr.starts_on AND lr.ends_on LIMIT 1`,
      [req.staffMember.id]
    );
    if (leaveRows.length) {
      return res.status(409).json({ error: `You are on approved ${leaveRows[0].leave_type_name} leave today. Attendance is not required.`, code: 'ON_LEAVE' });
    }
    // ── Enforce once-in, once-out per calendar day ──────────────────────────
    const { rows: todayRows } = await pool.query(
      `SELECT action, timestamp_utc FROM attendance_logs
       WHERE staff_id = $1
        AND is_accepted = true
         AND (timezone('UTC', timestamp_utc))::date = (timezone('UTC', NOW()))::date
       ORDER BY timestamp_utc ASC`,
      [req.staffMember.id]
    );

    const hasClockInToday = todayRows.some(r => r.action === 'clock_in');
    const hasClockOutToday = todayRows.some(r => r.action === 'clock_out');

    if (action === 'clock_in' && hasClockInToday) {
      return res.status(400).json({
        error: 'You have already clocked in today. Only one clock-in per day is allowed.',
        code: 'ALREADY_CLOCKED_IN'
      });
    }

    if (action === 'clock_out') {
      if (!hasClockInToday) {
        return res.status(400).json({
          error: 'You must clock in today before you can clock out.',
          code: 'NOT_CLOCKED_IN'
        });
      }
      if (hasClockOutToday) {
        return res.status(400).json({
          error: 'You have already clocked out today. Only one clock-out per day is allowed.',
          code: 'ALREADY_CLOCKED_OUT'
        });
      }
    }

    // Fetch site geofence
    let siteRow = null;
    if (req.staffMember.site_id) {
      const { rows } = await pool.query(
        'SELECT id, name, lat, lng, radius_meters, polygon_coordinates FROM sites WHERE id = $1 AND is_active = true',
        [req.staffMember.site_id]
      );
      siteRow = rows[0] || null;
    }

    // Geofence check
    let withinFence = false;
    let distanceM = null;
    if (siteRow && lat != null && lng != null) {
      const geo = isWithinFence({ lat, lng }, siteRow);
      withinFence = geo.within;
      distanceM = geo.distanceM;
    }

    // Last action for rapid clock detection
    const { rows: lastRows } = await pool.query(
      `SELECT action, timestamp_utc FROM attendance_logs
        WHERE staff_id = $1 AND is_accepted = true ORDER BY timestamp_utc DESC LIMIT 1`,
      [req.staffMember.id]
    );
    const lastLog = lastRows[0] || null;

    // Fraud signals
    const flags = evaluateFraudSignals({
      gpsAccuracyM: gps_accuracy_m ?? null,
      isMockLocation: !!is_mock_location,
      isWithinFence: withinFence,
      distanceFromSiteM: distanceM,
      lastActionTime: lastLog?.timestamp_utc ?? null,
      lastAction: lastLog?.action ?? null,
      isNewDevice: false, // already validated by deviceAuth
    });

    const isFlagged = flags.length > 0;
    const isTooFar = Boolean(siteRow && (lat == null || lng == null || !withinFence));
    const isAccepted = !isTooFar;

    // Insert log — server timestamp is authoritative
    const logId = uuidv4();
    const { rows: logRows } = await pool.query(
      `INSERT INTO attendance_logs
         (id, staff_id, site_id, device_id, action, timestamp_utc, client_time_utc,
          lat, lng, gps_accuracy_m, distance_from_site_m, is_within_fence,
           is_offline_sync, flag_reason, is_flagged, is_accepted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        logId,
        req.staffMember.id,
        siteRow?.id ?? null,
        req.device.id,
        action,
        serverTime,
        client_time_utc ? new Date(client_time_utc) : null,
        lat ?? null,
        lng ?? null,
        gps_accuracy_m ?? null,
        distanceM,
        withinFence,
        !!is_offline_sync,
        flags.length ? flags : null,
        isFlagged,
        isAccepted,
      ]
    );

    // If offline sync, record in offline_queue
    if (is_offline_sync && queued_at) {
      await pool.query(
        `INSERT INTO offline_queue (id, device_id, staff_id, payload, queued_at, log_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), req.device.id, req.staffMember.id, JSON.stringify(req.body), new Date(queued_at), logId]
      );
    }

    const log = logRows[0];
    if (isFlagged) {
      pool.query(
        `INSERT INTO notifications (id, user_id, type, title, body, data)
         SELECT $1, id, 'flagged_attendance', 'Flagged attendance event', $2, $3::jsonb
         FROM hr_users WHERE is_active = true`,
        [uuidv4(), `${req.staffMember.full_name} generated a flagged ${action.replace('_', ' ')} event.`, JSON.stringify({ logId: log.id, staffId: req.staffMember.id })],
      ).catch((notificationError) => console.error('notification create error:', notificationError));
    }
    if (isTooFar) {
      return res.status(403).json({
        error: distanceM == null
          ? (siteRow.polygon_coordinates
            ? 'Too far from the assigned location. Move inside the site geofence and try again.'
            : 'Location could not be verified. Move into the site area and try again.')
          : `Too far from the assigned location (${distanceM}m away). Move within ${siteRow.radius_meters}m and try again.`,
        code: 'TOO_FAR_FROM_LOCATION',
        distanceM,
        allowedRadiusM: siteRow.radius_meters,
        flagged: true,
      });
    }
    res.status(201).json({
      ok: true,
      logId: log.id,
      action: log.action,
      timestamp: log.timestamp_utc,
      isFlagged,
      flags,
      site: siteRow ? { id: siteRow.id, name: siteRow.name } : null,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({
        error: action === 'clock_in'
          ? 'You have already clocked in today. Only one clock-in per day is allowed.'
          : 'You have already clocked out today. Only one clock-out per day is allowed.',
        code: action === 'clock_in' ? 'ALREADY_CLOCKED_IN' : 'ALREADY_CLOCKED_OUT',
      });
    }
    console.error('clock error:', err);
    res.status(500).json({ error: 'Clock action failed' });
  }
});

// ── GET /api/attendance/me  (mobile — staff's own history) ────────────────
router.get('/me', deviceAuth, async (req, res) => {
  const since = req.query.since || new Date(Date.now() - 7 * 86400000).toISOString();
  try {
    const { rows } = await pool.query(
      `SELECT id, action, timestamp_utc, is_flagged, flag_reason, site_id
       FROM attendance_logs
       WHERE staff_id = $1 AND timestamp_utc >= $2
       ORDER BY timestamp_utc DESC`,
      [req.staffMember.id, since]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── GET /api/attendance/leave (mobile — approved and pending leave) ──────
router.get('/leave', deviceAuth, async (req, res) => {
  try {
    const [requests, leaveTypes] = await Promise.all([
      pool.query(
      `SELECT lr.id, lr.starts_on, lr.ends_on, lr.days, lr.reason, lr.status,
          lt.name AS leave_type_name
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.staff_id = $1 ORDER BY lr.starts_on DESC`,
      [req.staffMember.id]
      ),
      pool.query(`SELECT id, name, code, days_per_year FROM leave_types WHERE is_active = true ORDER BY name`),
    ]);
    const requestIds = requests.rows.map(row => row.id);
    const documents = requestIds.length ? await pool.query(
      `SELECT id, leave_request_id, document_type, file_name, mime_type, file_size, created_at
       FROM leave_documents WHERE leave_request_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
      [requestIds]
    ) : { rows: [] };
    const documentsByRequest = new Map();
    documents.rows.forEach(document => {
      if (!documentsByRequest.has(document.leave_request_id)) documentsByRequest.set(document.leave_request_id, []);
      documentsByRequest.get(document.leave_request_id).push(document);
    });
    res.json({ requests: requests.rows.map(row => ({ ...row, documents: documentsByRequest.get(row.id) || [] })), leaveTypes: leaveTypes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave' });
  }
});

// ── POST /api/attendance/leave (mobile — apply for leave) ────────────────
router.post('/leave', deviceAuth, [
  body('leave_type_id').isUUID().withMessage('A valid leave type is required'),
  body('starts_on').isISO8601().withMessage('Start date must use YYYY-MM-DD'),
  body('ends_on').isISO8601().withMessage('End date must use YYYY-MM-DD'),
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Reason is too long'),
  body('attachment').optional(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  const { leave_type_id, starts_on, ends_on, reason, attachment } = req.body;
  const documentError = attachment ? validateLeaveDocument(attachment) : null;
  if (documentError) return res.status(400).json({ error: documentError });
  const start = new Date(`${starts_on}T00:00:00Z`);
  const end = new Date(`${ends_on}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days < 1) return res.status(400).json({ error: 'End date must be on or after start date' });
  try {
    const { rows: overlap } = await pool.query(
      `SELECT id FROM leave_requests
      WHERE staff_id = $1 AND status IN ('pending_manager', 'pending_hr', 'approved')
         AND starts_on <= $3::date AND ends_on >= $2::date LIMIT 1`,
      [req.staffMember.id, starts_on, ends_on]
    );
    if (overlap.length) return res.status(409).json({ error: 'You already have a pending or approved leave request covering these dates.' });
    const { rows } = await pool.query(
      `INSERT INTO leave_requests (id, staff_id, leave_type_id, starts_on, ends_on, days, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_manager') RETURNING *`,
      [uuidv4(), req.staffMember.id, leave_type_id, starts_on, ends_on, days, reason || null]
    );
    const request = rows[0];
    const { rows: leaveTypeRows } = await pool.query('SELECT name FROM leave_types WHERE id = $1', [leave_type_id]);
    const summary = [
      'SyncOps Leave Application',
      `Employee: ${req.staffMember.full_name} (${req.staffMember.employee_id})`,
      `Leave type: ${leaveTypeRows[0]?.name || leave_type_id}`,
      `Dates: ${starts_on} to ${ends_on}`,
      `Days: ${days}`,
      `Reason: ${reason || 'Not provided'}`,
      'Status: Awaiting manager approval',
    ].join('\n');
    const summaryBase64 = Buffer.from(summary, 'utf8').toString('base64');
    await pool.query(
      `INSERT INTO leave_documents (id, leave_request_id, document_type, file_name, mime_type, file_size, content_base64, uploaded_by_staff_id)
       VALUES ($1,$2,'application_summary',$3,'text/plain',$4,$5,$6)`,
      [uuidv4(), request.id, `leave-application-${request.id}.txt`, Buffer.byteLength(summary), summaryBase64, req.staffMember.id]
    );
    if (attachment) {
      await pool.query(
        `INSERT INTO leave_documents (id, leave_request_id, document_type, file_name, mime_type, file_size, content_base64, uploaded_by_staff_id)
         VALUES ($1,$2,'supporting_document',$3,$4,$5,$6,$7)`,
        [uuidv4(), request.id, attachment.file_name, attachment.mime_type, attachment.file_size || null, attachment.content_base64, req.staffMember.id]
      );
    }
    res.status(201).json(request);
  } catch (err) {
    console.error('mobile leave application error:', err);
    res.status(400).json({ error: 'Could not submit leave application' });
  }
});

router.post('/leave/:id/documents', deviceAuth, async (req, res) => {
  const documentError = validateLeaveDocument(req.body.document);
  if (documentError) return res.status(400).json({ error: documentError });
  try {
    const { rows: requestRows } = await pool.query('SELECT id FROM leave_requests WHERE id = $1 AND staff_id = $2', [req.params.id, req.staffMember.id]);
    if (!requestRows.length) return res.status(404).json({ error: 'Leave request not found' });
    const document = req.body.document;
    const { rows } = await pool.query(
      `INSERT INTO leave_documents (id, leave_request_id, document_type, file_name, mime_type, file_size, content_base64, uploaded_by_staff_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, leave_request_id, document_type, file_name, mime_type, file_size, created_at`,
      [uuidv4(), req.params.id, document.document_type || 'supporting_document', document.file_name, document.mime_type, document.file_size || null, document.content_base64, req.staffMember.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not attach document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// HR DASHBOARD ENDPOINTS (JWT-authenticated)
// ─────────────────────────────────────────────────────────────────────────
router.use(authJwt);

// ── GET /api/attendance/leave/all (HR — all leave requests) ──────────────
router.get('/leave/all', async (req, res) => {
  const { status, staff_id, from, to, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const values = [];
  let idx = 1;
  if (status) { conditions.push(`lr.status = $${idx++}`); values.push(status); }
  if (staff_id) { conditions.push(`lr.staff_id = $${idx++}`); values.push(staff_id); }
  if (from) { conditions.push(`lr.starts_on >= $${idx++}`); values.push(from); }
  if (to) { conditions.push(`lr.ends_on <= $${idx++}`); values.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT lr.id, lr.starts_on, lr.ends_on, lr.days, lr.reason, lr.status,
          lr.created_at, lr.reviewed_at, lr.reviewer_notes,
          lt.name AS leave_type_name, lt.code AS leave_type_code,
          s.full_name, s.employee_id, si.name AS site_name,
          (SELECT COUNT(*) FROM leave_documents ld WHERE ld.leave_request_id = lr.id)::int AS document_count
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN staff s ON s.id = lr.staff_id
       LEFT JOIN sites si ON si.id = s.site_id
       ${where}
       ORDER BY lr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, parseInt(limit), parseInt(offset)]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM leave_requests lr ${where}`, values
    );
    res.json({ requests: rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('leave/all error:', err);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// ── PATCH /api/attendance/leave/:id/status (HR — approve or reject) ───────
router.patch('/leave/:id/status', async (req, res) => {
  const { status, reviewer_notes } = req.body;
  if (!['approved', 'rejected', 'pending_hr', 'pending_manager'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE leave_requests
       SET status = $1, reviewed_at = NOW(), reviewer_notes = $2
       WHERE id = $3
       RETURNING id, status, reviewed_at`,
      [status, reviewer_notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Leave request not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('leave status update error:', err);
    res.status(500).json({ error: 'Failed to update leave status' });
  }
});

// ── GET /api/attendance/daily (HR — one row per employee per day) ────────
router.get('/daily', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `WITH days AS (SELECT generate_series($1::date, $2::date, '1 day')::date AS day)
       SELECT s.id AS staff_id, s.employee_id, s.full_name, si.name AS site_name, days.day,
         CASE WHEN lr.id IS NOT NULL THEN 'leave'
              WHEN ci.id IS NOT NULL AND co.id IS NOT NULL THEN 'present'
              WHEN ci.id IS NOT NULL THEN 'missing_clock_out'
              ELSE 'absent' END AS status,
         ci.timestamp_utc AS clock_in, co.timestamp_utc AS clock_out,
         lt.name AS leave_type_name
       FROM staff s CROSS JOIN days
       LEFT JOIN sites si ON si.id = s.site_id
       LEFT JOIN attendance_logs ci ON ci.staff_id = s.id AND ci.action = 'clock_in' AND ci.is_accepted = true AND ci.timestamp_utc::date = days.day
       LEFT JOIN attendance_logs co ON co.staff_id = s.id AND co.action = 'clock_out' AND co.is_accepted = true AND co.timestamp_utc::date = days.day
       LEFT JOIN leave_requests lr ON lr.staff_id = s.id AND lr.status = 'approved' AND days.day BETWEEN lr.starts_on AND lr.ends_on
       LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE s.status = 'active' ORDER BY days.day DESC, s.full_name`,
      [from, to]
    );
    res.json({ from, to, rows });
  } catch (err) {
    console.error('daily attendance error:', err);
    res.status(500).json({ error: 'Failed to build daily attendance report' });
  }
});

// ── GET /api/attendance  (HR — full log with filters) ─────────────────────
router.get(
  '/',
  [
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('staff_id').optional().isUUID(),
    query('site_id').optional().isUUID(),
    query('flagged').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { from, to, staff_id, site_id, flagged, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (from) { conditions.push(`al.timestamp_utc >= $${idx++}`); values.push(from); }
    if (to) { conditions.push(`al.timestamp_utc <= $${idx++}`); values.push(to); }
    if (staff_id) { conditions.push(`al.staff_id = $${idx++}`); values.push(staff_id); }
    if (site_id) { conditions.push(`al.site_id = $${idx++}`); values.push(site_id); }
    if (flagged === 'true') { conditions.push(`al.is_flagged = true`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const { rows } = await pool.query(
        `SELECT
           al.id, al.action, al.timestamp_utc, al.lat, al.lng, al.gps_accuracy_m,
           al.distance_from_site_m, al.is_within_fence, al.is_flagged, al.flag_reason,
           al.is_offline_sync, al.client_time_utc,
           s.full_name as staff_name, s.employee_id,
           si.name as site_name,
           d.device_label
         FROM attendance_logs al
         LEFT JOIN staff s ON s.id = al.staff_id
         LEFT JOIN sites si ON si.id = al.site_id
         LEFT JOIN devices d ON d.id = al.device_id
         ${where}
         ORDER BY al.timestamp_utc DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, parseInt(limit), parseInt(offset)]
      );

      const count = await pool.query(
        `SELECT COUNT(*) FROM attendance_logs al ${where}`,
        values
      );

      res.json({ logs: rows, total: parseInt(count.rows[0].count) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch attendance logs' });
    }
  }
);

// ── GET /api/attendance/export  (CSV) ─────────────────────────────────────
router.get('/export', async (req, res) => {
  const { from, to, staff_id, site_id, flagged } = req.query;
  const conditions = [];
  const values = [];
  let idx = 1;

  if (from) { conditions.push(`al.timestamp_utc >= $${idx++}`); values.push(from); }
  if (to) { conditions.push(`al.timestamp_utc <= $${idx++}`); values.push(to); }
  if (staff_id) { conditions.push(`al.staff_id = $${idx++}`); values.push(staff_id); }
  if (site_id) { conditions.push(`al.site_id = $${idx++}`); values.push(site_id); }
  if (flagged === 'true') { conditions.push('al.is_flagged = true'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         s.employee_id, s.full_name as staff_name,
         al.action, al.timestamp_utc, al.is_within_fence,
         al.distance_from_site_m, al.gps_accuracy_m,
         al.is_flagged, al.flag_reason,
         si.name as site_name, d.device_label
       FROM attendance_logs al
       LEFT JOIN staff s ON s.id = al.staff_id
       LEFT JOIN sites si ON si.id = al.site_id
       LEFT JOIN devices d ON d.id = al.device_id
       ${where}
       ORDER BY al.timestamp_utc DESC`,
      values
    );

    const header = [
      'Employee ID', 'Staff Name', 'Action', 'Timestamp (UTC)',
      'Site', 'Within Fence', 'Distance (m)', 'GPS Accuracy (m)',
      'Flagged', 'Flag Reasons', 'Device',
    ].join(',');

    const csvEscape = (value) => {
      const str = value == null ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvRows = rows.map((r) =>
      [
        csvEscape(r.employee_id),
        csvEscape(r.staff_name),
        csvEscape(r.action),
        csvEscape(r.timestamp_utc ? new Date(r.timestamp_utc).toISOString() : ''),
        csvEscape(r.site_name),
        csvEscape(r.is_within_fence),
        csvEscape(r.distance_from_site_m),
        csvEscape(r.gps_accuracy_m),
        csvEscape(r.is_flagged),
        csvEscape((r.flag_reason || []).join('; ')),
        csvEscape(r.device_label),
      ].join(',')
    );

    const csv = [header, ...csvRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="syncops_attendance_${Date.now()}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    console.error('export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── GET /api/attendance/dashboard  (summary for dashboard home) ───────────
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Total active staff
    const { rows: totalRows } = await pool.query(
      "SELECT COUNT(*) FROM staff WHERE status = 'active'"
    );
    const totalActive = parseInt(totalRows[0].count);

    // Clocked in today
    const { rows: presentRows } = await pool.query(
      `SELECT COUNT(DISTINCT staff_id) FROM attendance_logs
       WHERE action = 'clock_in' AND timestamp_utc >= $1 AND timestamp_utc < $2`,
      [today.toISOString(), tomorrow.toISOString()]
    );
    const present = parseInt(presentRows[0].count);

    // Late according to the assigned shift; unassigned staff retain a 09:00 fallback.
    const { rows: lateRows } = await pool.query(
      `SELECT COUNT(DISTINCT al.staff_id) FROM attendance_logs al
       JOIN staff s ON s.id = al.staff_id
       LEFT JOIN staff_shifts ss ON ss.staff_id = s.id
       LEFT JOIN shifts sh ON sh.id = ss.shift_id AND sh.is_active = true
       WHERE al.action = 'clock_in' AND al.timestamp_utc >= $1 AND al.timestamp_utc < $2
         AND (CASE WHEN sh.id IS NULL
             THEN (al.timestamp_utc AT TIME ZONE 'UTC')::time > TIME '09:00'
             ELSE (al.timestamp_utc AT TIME ZONE COALESCE(sh.timezone, 'UTC'))::time
               > sh.start_time + (sh.grace_minutes * INTERVAL '1 minute')
           END)`,
      [today.toISOString(), tomorrow.toISOString()]
    );
    const late = parseInt(lateRows[0].count);

    // Flagged today
    const { rows: flaggedRows } = await pool.query(
      `SELECT COUNT(*) FROM attendance_logs
       WHERE is_flagged = true AND timestamp_utc >= $1 AND timestamp_utc < $2`,
      [today.toISOString(), tomorrow.toISOString()]
    );
    const flagged = parseInt(flaggedRows[0].count);

    // Recent activity (last 20 events)
    const { rows: recent } = await pool.query(
      `SELECT al.action, al.timestamp_utc, al.is_flagged,
              s.full_name as staff_name, si.name as site_name
       FROM attendance_logs al
       LEFT JOIN staff s ON s.id = al.staff_id
       LEFT JOIN sites si ON si.id = al.site_id
       ORDER BY al.timestamp_utc DESC LIMIT 20`
    );

    res.json({
      summary: {
        present,
        late,
        absent: Math.max(0, totalActive - present),
        flagged,
        totalActive,
      },
      recentActivity: recent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
