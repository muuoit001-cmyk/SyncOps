const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();

// ── POST /api/devices/enroll  (mobile — called during enrollment) ─────────
// No HR JWT needed — identified by employee_id lookup first
router.post(
  '/enroll',
  [
    body('staff_id').isUUID(),
    body('device_label').optional().trim(),
    body('platform').optional().isIn(['ios', 'android']),
    body('public_key_b64').optional().isString(),
    body('enrollment_code').trim().isLength({ min: 8 }).withMessage('One-time enrollment code is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { staff_id, device_label, platform, public_key_b64, enrollment_code } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Verify staff exists and is active
      const { rows: staffRows } = await client.query(
        "SELECT id, status FROM staff WHERE id = $1",
        [staff_id]
      );
      if (!staffRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Staff not found' });
      }
      if (staffRows[0].status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Staff account not active' });
      }

      const codeHash = crypto.createHash('sha256').update(String(enrollment_code).trim().toUpperCase()).digest('hex');
      const { rows: claimedStaff } = await client.query(
        `UPDATE staff
         SET enrollment_code_used_at = NOW()
         WHERE id = $1 AND enrollment_code_hash = $2
           AND enrollment_code_used_at IS NULL AND enrollment_code_expires_at > NOW()
         RETURNING id`,
        [staff_id, codeHash],
      );
      if (!claimedStaff.length) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Enrollment code is invalid, expired, or already used.' });
      }

      // Check for existing active device for this staff
      const { rows: existingDevices } = await pool.query(
        'SELECT id FROM devices WHERE staff_id = $1 AND is_active = true',
        [staff_id]
      );

      if (existingDevices.length > 0) {
        // Flag new device login for HR review
        // Deactivate old devices first (one active device per staff for MVP)
        await client.query(
          'UPDATE devices SET is_active = false WHERE staff_id = $1',
          [staff_id]
        );
      }

      // Generate a device token (HMAC signing secret)
      const deviceToken = crypto.randomBytes(48).toString('hex');
      const deviceId = uuidv4();

      await client.query(
        `INSERT INTO devices (id, staff_id, device_label, platform, public_key_b64, device_token)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [deviceId, staff_id, device_label || null, platform || null, public_key_b64 || null, deviceToken]
      );

      // Mark staff as enrolled
      await pool.query(
        "UPDATE staff SET enrolled_at = NOW() WHERE id = $1",
        [staff_id]
      );

      const isNewDevice = existingDevices.length > 0;

      await client.query('COMMIT');

      res.status(201).json({
        deviceId,
        deviceToken,    // ⚠ Only returned once — stored in device secure storage
        isNewDevice,    // HR is notified if true
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('enroll error:', err);
      if (err.code === '23505') return res.status(409).json({ error: 'This device is already enrolled or the employee already has a conflicting device record.' });
      res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Enrollment failed' : `Enrollment failed: ${err.message}` });
    } finally {
      client.release();
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// HR DASHBOARD ENDPOINTS (JWT-authenticated)
// ─────────────────────────────────────────────────────────────────────────
router.use(authJwt);

// ── GET /api/devices  (HR — list all devices) ─────────────────────────────
router.get('/', async (req, res) => {
  const { staff_id } = req.query;
  const where = staff_id ? 'WHERE d.staff_id = $1' : '';
  const values = staff_id ? [staff_id] : [];
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.device_label, d.platform, d.is_active, d.enrolled_at, d.last_used_at,
              s.full_name as staff_name, s.employee_id
       FROM devices d
       JOIN staff s ON s.id = d.staff_id
       ${where}
       ORDER BY d.enrolled_at DESC`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ── DELETE /api/devices/:id  (HR — revoke device) ─────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE devices SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Device not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

module.exports = router;
