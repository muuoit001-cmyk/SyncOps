const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

// ── GET /api/staff ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.employee_id, s.full_name, s.email, s.phone,
        s.status, s.enrolled_at, s.created_at,
        si.id as site_id, si.name as site_name,
        (
          SELECT timestamp_utc
          FROM attendance_logs al
          WHERE al.staff_id = s.id AND al.action = 'clock_in'
          ORDER BY timestamp_utc DESC LIMIT 1
        ) as last_clock_in
      FROM staff s
      LEFT JOIN sites si ON si.id = s.site_id
      ORDER BY s.full_name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// ── GET /api/staff/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, si.name as site_name
      FROM staff s
      LEFT JOIN sites si ON si.id = s.site_id
      WHERE s.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff member' });
  }
});

// ── POST /api/staff ────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('employee_id').trim().notEmpty(),
    body('full_name').trim().isLength({ min: 2 }),
    body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
    body('site_id').optional({ nullable: true }).isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { employee_id, full_name, email, phone, site_id } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO staff (id, employee_id, full_name, email, phone, site_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [uuidv4(), employee_id.toUpperCase(), full_name, email || null, phone || null, site_id || null, req.hrUser.id]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Employee ID already exists' });
      console.error(err);
      res.status(500).json({ error: 'Failed to create staff member' });
    }
  }
);

// ── PATCH /api/staff/:id ──────────────────────────────────────────────────
router.patch(
  '/:id',
  [
    body('full_name').optional().trim().isLength({ min: 2 }),
    body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
    body('site_id').optional({ nullable: true }).isUUID(),
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['full_name', 'email', 'phone', 'site_id', 'status'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);

    try {
      const { rows } = await pool.query(
        `UPDATE staff SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update staff member' });
    }
  }
);

// ── DELETE /api/staff/:id (deactivate) ───────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE staff SET status = 'inactive' WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    // Also deactivate their devices
    await pool.query('UPDATE devices SET is_active = false WHERE staff_id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate staff' });
  }
});

// ── GET /api/staff/lookup/:employee_id  (mobile enrollment) ──────────────
// NOTE: This route does NOT require HR JWT — it's called by mobile during enrollment
router.get('/lookup/:employee_id', (req, res, next) => next(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.employee_id, s.full_name, s.site_id, s.status, si.name as site_name
       FROM staff s
       LEFT JOIN sites si ON si.id = s.site_id
       WHERE s.employee_id = $1`,
      [req.params.employee_id.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee ID not found' });
    if (rows[0].status !== 'active') return res.status(403).json({ error: 'Staff account is not active' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
