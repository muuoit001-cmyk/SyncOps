const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

// ── GET /api/sites ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM staff WHERE site_id = s.id AND status = 'active') as staff_count
      FROM sites s
      WHERE s.is_active = true
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// ── GET /api/sites/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sites WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch site' });
  }
});

// ── POST /api/sites ────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2 }),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
    body('radius_meters').isInt({ min: 10, max: 5000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, address, lat, lng, radius_meters } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO sites (id, name, address, lat, lng, radius_meters, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [uuidv4(), name, address || null, lat, lng, radius_meters, req.hrUser.id]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create site' });
    }
  }
);

// ── PATCH /api/sites/:id ───────────────────────────────────────────────
router.patch(
  '/:id',
  [
    body('name').optional().trim().isLength({ min: 2 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('radius_meters').optional().isInt({ min: 10, max: 5000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['name', 'address', 'lat', 'lng', 'radius_meters'];
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
        `UPDATE sites SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ error: 'Site not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update site' });
    }
  }
);

// ── DELETE /api/sites/:id (soft delete) ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sites SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ── GET /api/sites/:id/geofence (public - used by mobile) ────────────
// Returns minimal data for geofence check — no auth needed
router.get('/:id/geofence', (req, res, next) => next(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, lat, lng, radius_meters FROM sites WHERE id = $1 AND is_active = true',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch geofence' });
  }
});

module.exports = router;
