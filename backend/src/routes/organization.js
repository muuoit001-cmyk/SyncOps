const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt, requireWriteAccess, requireAdmin } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);
const MAX_LEAVE_DOCUMENT_BYTES = 8 * 1024 * 1024;

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  next();
}

router.get('/overview', async (req, res) => {
  try {
    const [departments, teams, shifts, leaveTypes, leaveRequests] = await Promise.all([
      pool.query(`SELECT d.*, sh.name AS shift_name, sh.start_time AS shift_start_time, sh.end_time AS shift_end_time, COUNT(s.id)::int AS staff_count
        FROM departments d LEFT JOIN staff s ON s.department_id = d.id AND s.status = 'active'
        LEFT JOIN shifts sh ON sh.id = d.shift_id
        WHERE d.is_active = true
        GROUP BY d.id, sh.name, sh.start_time, sh.end_time
        ORDER BY d.name`),
      pool.query(`SELECT t.*, d.name AS department_name, si.name AS site_name,
          leader.full_name AS leader_name, COUNT(s.id)::int AS staff_count
        FROM teams t LEFT JOIN departments d ON d.id = t.department_id LEFT JOIN sites si ON si.id = t.site_id
        LEFT JOIN staff leader ON leader.id = t.leader_staff_id
        LEFT JOIN staff s ON s.team_id = t.id AND s.status = 'active'
        WHERE t.is_active = true GROUP BY t.id, d.name, si.name, leader.full_name ORDER BY t.name`),
      pool.query(`SELECT sh.*, COUNT(ss.staff_id)::int AS staff_count
        FROM shifts sh LEFT JOIN staff_shifts ss ON ss.shift_id = sh.id
        WHERE sh.is_active = true GROUP BY sh.id ORDER BY sh.start_time`),
      pool.query(`SELECT * FROM leave_types WHERE is_active = true ORDER BY name`),
        pool.query(`SELECT lr.*, s.full_name, s.employee_id, lt.name AS leave_type_name,
          manager.full_name AS manager_name
        FROM leave_requests lr JOIN staff s ON s.id = lr.staff_id JOIN leave_types lt ON lt.id = lr.leave_type_id
        LEFT JOIN staff manager ON manager.id = s.manager_staff_id
        WHERE lr.status IN ('pending_manager', 'pending_hr') ORDER BY lr.starts_on, lr.created_at`),
    ]);
    const requestIds = leaveRequests.rows.map(row => row.id);
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
    res.json({ departments: departments.rows, teams: teams.rows, shifts: shifts.rows, leaveTypes: leaveTypes.rows, pendingLeave: leaveRequests.rows.map(row => ({ ...row, documents: documentsByRequest.get(row.id) || [] })) });
  } catch (err) {
    console.error('organization overview error:', err);
    res.status(500).json({ error: 'Failed to load organization data' });
  }
});

router.post('/departments', requireWriteAccess, [
  body('name').trim().isLength({ min: 2 }),
  body('code').trim().isLength({ min: 2, max: 32 }).withMessage('Department code is required'),
  body('description').optional({ checkFalsy: true }).trim(),
  body('shift_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid department shift'),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO departments (id, name, code, description, shift_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uuidv4(), req.body.name.trim(), req.body.code.trim().toUpperCase(), req.body.description || null, req.body.shift_id || null, req.hrUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Department name or code already exists' : 'Failed to create department' });
  }
});

router.patch('/departments/:id', requireWriteAccess, [
  body('shift_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid department shift'),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE departments SET shift_id = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *`,
      [req.body.shift_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Department not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not update department shift' });
  }
});

router.post('/teams', requireWriteAccess, [
  body('name').trim().isLength({ min: 2 }),
  body('code').trim().isLength({ min: 2, max: 32 }),
  body('department_id').optional({ checkFalsy: true }).isUUID(),
  body('site_id').optional({ checkFalsy: true }).isUUID(),
  body('leader_staff_id').optional({ checkFalsy: true }).isUUID(),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO teams (id, name, code, department_id, site_id, leader_staff_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uuidv4(), req.body.name.trim(), req.body.code.trim().toUpperCase(), req.body.department_id || null, req.body.site_id || null, req.body.leader_staff_id || null, req.hrUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Team code already exists' : 'Failed to create team' });
  }
});

router.post('/leave-types', requireWriteAccess, [
  body('name').trim().isLength({ min: 2 }),
  body('code').trim().isLength({ min: 2, max: 32 }),
  body('days_per_year').isFloat({ min: 0, max: 366 }),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO leave_types (id, name, code, days_per_year) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uuidv4(), req.body.name.trim(), req.body.code.trim().toUpperCase(), req.body.days_per_year]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Leave type name or code already exists' : 'Failed to create leave type' });
  }
});

router.post('/leave-requests', requireWriteAccess, [
  body('staff_id').isUUID(), body('leave_type_id').isUUID(),
  body('starts_on').isISO8601(), body('ends_on').isISO8601(),
  body('days').isFloat({ min: 0.5 }), body('reason').optional({ checkFalsy: true }).trim(),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO leave_requests (id, staff_id, leave_type_id, starts_on, ends_on, days, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_manager') RETURNING *`,
      [uuidv4(), req.body.staff_id, req.body.leave_type_id, req.body.starts_on, req.body.ends_on, req.body.days, req.body.reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not create leave request' });
  }
});

router.patch('/leave-requests/:id', requireWriteAccess, [
  body('status').isIn(['cancelled']),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [req.body.status, req.hrUser.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Leave request not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update leave request' });
  }
});

// Manager stage: hr_manager represents the manager approval role until manager
// dashboard identities are provisioned separately.
router.patch('/leave-requests/:id/manager', requireWriteAccess, async (req, res) => {
  if (!['hr_manager', 'hr_admin'].includes(req.hrUser?.role)) {
    return res.status(403).json({ error: 'Manager approval role required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE leave_requests lr
       SET status = 'pending_hr',
           manager_approved_by = (SELECT manager_staff_id FROM staff WHERE id = lr.staff_id),
           manager_approved_at = NOW()
       WHERE lr.id = $1 AND lr.status = 'pending_manager' RETURNING lr.*`,
      [req.params.id]
    );
    if (!rows.length) return res.status(409).json({ error: 'Leave request is not awaiting manager approval' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not approve leave as manager' });
  }
});

// Final HR stage: only hr_admin can make an approved leave effective.
router.patch('/leave-requests/:id/hr', requireAdmin, [
  body('status').isIn(['approved', 'rejected']),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE leave_requests SET status = $1, hr_approved_by = $2, hr_approved_at = NOW(),
          reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3 AND status = 'pending_hr' RETURNING *`,
      [req.body.status, req.hrUser.id, req.params.id]
    );
    if (!rows.length) return res.status(409).json({ error: 'Leave request is not awaiting HR approval' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not complete HR leave approval' });
  }
});

router.post('/leave-requests/:id/documents', requireWriteAccess, async (req, res) => {
  const document = req.body.document;
  const size = Number(document?.file_size || 0);
  if (!document?.file_name || !document?.mime_type || !document?.content_base64) return res.status(400).json({ error: 'Document name, type, and content are required' });
  if (!size || size > MAX_LEAVE_DOCUMENT_BYTES) return res.status(400).json({ error: 'Document must be smaller than 8 MB' });
  try {
    const { rows: requestRows } = await pool.query('SELECT id FROM leave_requests WHERE id = $1', [req.params.id]);
    if (!requestRows.length) return res.status(404).json({ error: 'Leave request not found' });
    const { rows } = await pool.query(
      `INSERT INTO leave_documents (id, leave_request_id, document_type, file_name, mime_type, file_size, content_base64, uploaded_by_user_id)
       VALUES ($1,$2,'manager_signed',$3,$4,$5,$6,$7)
       RETURNING id, leave_request_id, document_type, file_name, mime_type, file_size, created_at`,
      [uuidv4(), req.params.id, document.file_name, document.mime_type, size, document.content_base64, req.hrUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not upload signed document' });
  }
});

router.get('/leave-documents/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT file_name, mime_type, content_base64 FROM leave_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    const document = rows[0];
    res.json(document);
  } catch (err) {
    res.status(500).json({ error: 'Could not load document' });
  }
});

module.exports = router;
