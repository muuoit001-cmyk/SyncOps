const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt, requireWriteAccess } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sh.*, COUNT(ss.staff_id)::int AS staff_count
      FROM shifts sh LEFT JOIN staff_shifts ss ON ss.shift_id = sh.id
      WHERE sh.is_active = true GROUP BY sh.id ORDER BY sh.start_time
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

router.post('/', requireWriteAccess, [
  body('name').trim().isLength({ min: 2 }),
  body('start_time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Start time must use HH:MM format'),
  body('end_time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('End time must use HH:MM format'),
  body('grace_minutes').optional().isInt({ min: 0, max: 240 }),
  body('overtime_after_minutes').optional().isInt({ min: 1, max: 1440 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid shift details', errors: errors.array() });
  const { name, start_time, end_time, timezone = 'UTC', grace_minutes = 0, overtime_after_minutes = 480, working_days = [1, 2, 3, 4, 5], description = null } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO shifts (id, name, start_time, end_time, timezone, grace_minutes, overtime_after_minutes, working_days, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [uuidv4(), name.trim(), start_time, end_time, timezone, grace_minutes, overtime_after_minutes, JSON.stringify(working_days), description, req.hrUser.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

router.put('/assign/:staffId', requireWriteAccess, [
  body('shift_id').isUUID(),
  body('effective_from').optional().isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid shift assignment', errors: errors.array() });
  try {
    const { rows } = await pool.query(
      `INSERT INTO staff_shifts (staff_id, shift_id, effective_from) VALUES ($1,$2,$3)
       ON CONFLICT (staff_id) DO UPDATE SET shift_id = EXCLUDED.shift_id, effective_from = EXCLUDED.effective_from
       RETURNING *`,
      [req.params.staffId, req.body.shift_id, req.body.effective_from || new Date().toISOString().slice(0, 10)],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Could not assign shift to staff member' });
  }
});

router.delete('/:id', requireWriteAccess, async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE shifts SET is_active = false WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Shift not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate shift' });
  }
});

module.exports = router;
