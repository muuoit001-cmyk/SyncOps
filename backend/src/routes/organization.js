const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt, requireWriteAccess } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  next();
}

router.get('/overview', async (req, res) => {
  try {
    const [departments, teams, shifts, leaveTypes, leaveRequests] = await Promise.all([
      pool.query(`SELECT d.*, COUNT(s.id)::int AS staff_count
        FROM departments d LEFT JOIN staff s ON s.department_id = d.id AND s.status = 'active'
        WHERE d.is_active = true GROUP BY d.id ORDER BY d.name`),
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
      pool.query(`SELECT lr.*, s.full_name, s.employee_id, lt.name AS leave_type_name
        FROM leave_requests lr JOIN staff s ON s.id = lr.staff_id JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.status = 'pending' ORDER BY lr.starts_on, lr.created_at`),
    ]);
    res.json({ departments: departments.rows, teams: teams.rows, shifts: shifts.rows, leaveTypes: leaveTypes.rows, pendingLeave: leaveRequests.rows });
  } catch (err) {
    console.error('organization overview error:', err);
    res.status(500).json({ error: 'Failed to load organization data' });
  }
});

router.post('/departments', requireWriteAccess, [
  body('name').trim().isLength({ min: 2 }),
  body('code').trim().isLength({ min: 2, max: 32 }).withMessage('Department code is required'),
  body('description').optional({ checkFalsy: true }).trim(),
], validate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO departments (id, name, code, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [uuidv4(), req.body.name.trim(), req.body.code.trim().toUpperCase(), req.body.description || null, req.hrUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Department name or code already exists' : 'Failed to create department' });
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
      `INSERT INTO leave_requests (id, staff_id, leave_type_id, starts_on, ends_on, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uuidv4(), req.body.staff_id, req.body.leave_type_id, req.body.starts_on, req.body.ends_on, req.body.days, req.body.reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not create leave request' });
  }
});

router.patch('/leave-requests/:id', requireWriteAccess, [
  body('status').isIn(['approved', 'rejected', 'cancelled']),
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

module.exports = router;
