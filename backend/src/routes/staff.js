const express = require('express');
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');
const { requireWriteAccess } = require('../middleware/authJwt');

const router = express.Router();

// ── GET /api/staff/lookup/:employee_id  (mobile enrollment) ──────────────
// NOTE: Public endpoint — called by mobile device during enrollment
router.get('/lookup/:employee_id', async (req, res) => {
  const enrollmentCode = String(req.query.code || '').trim().toUpperCase();
  if (!enrollmentCode) return res.status(401).json({ error: 'A one-time enrollment code is required.' });
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.employee_id, s.full_name, s.site_id, s.status, si.name as site_name
       FROM staff s
       LEFT JOIN sites si ON si.id = s.site_id
       WHERE UPPER(s.employee_id) = $1
         AND s.enrollment_code_hash = $2
         AND s.enrollment_code_used_at IS NULL
         AND s.enrollment_code_expires_at > NOW()`,
      [req.params.employee_id.trim().toUpperCase(), crypto.createHash('sha256').update(enrollmentCode).digest('hex')]
    );
    if (!rows.length) return res.status(401).json({ error: 'Employee ID or enrollment code is invalid or expired.' });
    if (rows[0].status !== 'active') return res.status(403).json({ error: 'Staff account is not active' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Staff lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// HR DASHBOARD ENDPOINTS (JWT-authenticated)
// ─────────────────────────────────────────────────────────────────────────
router.use(authJwt);

// ── POST /api/staff/:id/enrollment-code ───────────────────────────────────
router.post('/:id/enrollment-code', requireWriteAccess, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, employee_id, full_name, status FROM staff WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    if (rows[0].status !== 'active') return res.status(400).json({ error: 'Only active staff can be enrolled' });

    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    await pool.query(
      `UPDATE staff SET enrollment_code_hash = $1, enrollment_code_expires_at = NOW() + INTERVAL '24 hours', enrollment_code_used_at = NULL WHERE id = $2`,
      [hash, req.params.id],
    );
    res.json({ employee_id: rows[0].employee_id, full_name: rows[0].full_name, code, expiresInHours: 24 });
  } catch (err) {
    console.error('Enrollment code error:', err);
    res.status(500).json({ error: 'Failed to generate enrollment code' });
  }
});

// ── GET /api/staff ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.employee_id, s.full_name, s.email, s.phone,
        s.status, s.enrolled_at, s.created_at, s.department_id, s.team_id, s.role_title,
        d.name AS department_name, t.name AS team_name,
        sh.id AS shift_id, sh.name AS shift_name,
        si.id as site_id, si.name as site_name,
        (
          SELECT timestamp_utc
          FROM attendance_logs al
          WHERE al.staff_id = s.id AND al.action = 'clock_in'
          ORDER BY timestamp_utc DESC LIMIT 1
        ) as last_clock_in
      FROM staff s
      LEFT JOIN sites si ON si.id = s.site_id
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN teams t ON t.id = s.team_id
      LEFT JOIN staff_shifts ss ON ss.staff_id = s.id
      LEFT JOIN shifts sh ON sh.id = ss.shift_id AND sh.is_active = true
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
      SELECT s.*, si.name as site_name, d.name AS department_name, t.name AS team_name,
        sh.id AS shift_id, sh.name AS shift_name
      FROM staff s
      LEFT JOIN sites si ON si.id = s.site_id
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN teams t ON t.id = s.team_id
      LEFT JOIN staff_shifts ss ON ss.staff_id = s.id
      LEFT JOIN shifts sh ON sh.id = ss.shift_id AND sh.is_active = true
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
  requireWriteAccess,
  [
    body('employee_id').trim().notEmpty().withMessage('Employee ID is required'),
    body('full_name').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('site_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid site ID'),
    body('department_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid department ID'),
    body('team_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid team ID'),
    body('role_title').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
    }

    const { employee_id, full_name, email, phone, site_id, department_id, team_id, role_title, shift_id } = req.body;
    try {
      const cleanEmail = email && email.trim() ? email.trim() : null;
      const cleanPhone = phone && phone.trim() ? phone.trim() : null;
      const cleanSiteId = site_id && String(site_id).trim() ? String(site_id).trim() : null;
      const createdBy = req.hrUser?.id || null;

      const insertStaff = async (creatorId) => pool.query(
        `INSERT INTO staff (id, employee_id, full_name, email, phone, site_id, department_id, team_id, role_title, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [uuidv4(), employee_id.trim().toUpperCase(), full_name.trim(), cleanEmail, cleanPhone, cleanSiteId, department_id || null, team_id || null, role_title || null, creatorId]
      );

      let result;
      try {
        result = await insertStaff(createdBy);
      } catch (err) {
        if (err.code === '23503' && createdBy) {
          result = await insertStaff(null);
        } else {
          throw err;
        }
      }
      if (shift_id) await pool.query(
        `INSERT INTO staff_shifts (staff_id, shift_id) VALUES ($1, $2)
         ON CONFLICT (staff_id) DO UPDATE SET shift_id = EXCLUDED.shift_id, effective_from = CURRENT_DATE`,
        [result.rows[0].id, shift_id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Employee ID already exists' });
      if (err.code === '23503') return res.status(400).json({ error: 'The selected branch/site does not exist. Please choose a valid site.' });
      console.error('Create staff error:', err);
      res.status(500).json({ error: err.message || 'Failed to create staff member' });
    }
  }
);

function pickField(row, keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
    const found = Object.keys(row || {}).find(
      (k) => k.toLowerCase().replace(/[_\s]/g, '') === key.toLowerCase().replace(/[_\s]/g, '')
    );
    if (found && String(row[found]).trim()) return String(row[found]).trim();
  }
  return '';
}

// ── POST /api/staff/bulk ──────────────────────────────────────────────────
router.post('/bulk', requireWriteAccess, async (req, res) => {
  const { staff } = req.body;
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.status(400).json({ error: 'Staff list must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    const { rows: siteRows } = await client.query(
      "SELECT id, LOWER(TRIM(name)) as lower_name FROM sites WHERE is_active = true"
    );
    const siteMap = new Map();
    siteRows.forEach((s) => {
      siteMap.set(s.id, s.id);
      siteMap.set(s.lower_name, s.id);
    });

    const { rows: existingStaff } = await client.query('SELECT LOWER(employee_id) as employee_id FROM staff');
    const existingIds = new Set(existingStaff.map((s) => s.employee_id));
    const seenInFile = new Set();

    const imported = [];
    const duplicates = [];
    const failed = [];

    for (let i = 0; i < staff.length; i++) {
      const row = staff[i];
      const rowNum = i + 2;
      const empId = pickField(row, ['employee_id', 'Employee ID', 'employeeId']).toUpperCase();
      const name = pickField(row, ['full_name', 'Full Name', 'name']);
      const email = pickField(row, ['email', 'Email']) || null;
      const phone = pickField(row, ['phone', 'Phone']) || null;
      const rawSite = pickField(row, ['site_name', 'Site Name', 'site', 'branch', 'Branch', 'site_id', 'Site ID']);

      if (!empId) {
        failed.push({ row: rowNum, column: 'Employee ID', employee_id: empId, error: 'Employee ID is required', data: row });
        continue;
      }
      if (!name || name.length < 2) {
        failed.push({ row: rowNum, column: 'Full Name', employee_id: empId, error: 'Full name is required', data: row });
        continue;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed.push({ row: rowNum, column: 'Email', employee_id: empId, error: 'Invalid email address', data: row });
        continue;
      }

      if (seenInFile.has(empId) || existingIds.has(empId.toLowerCase())) {
        duplicates.push({
          row: rowNum,
          column: 'Employee ID',
          employee_id: empId,
          error: existingIds.has(empId.toLowerCase())
            ? 'Employee ID already exists in the database'
            : 'Duplicate Employee ID in this file',
          data: row,
        });
        continue;
      }

      let siteId = null;
      if (rawSite) {
        siteId = siteMap.get(rawSite.toLowerCase()) || siteMap.get(rawSite) || null;
        if (!siteId) {
          failed.push({
            row: rowNum,
            column: 'Site Name',
            employee_id: empId,
            error: `Branch/site "${rawSite}" was not found. Create the site first or use the exact site name.`,
            data: row,
          });
          continue;
        }
      }

      try {
        const { rows: inserted } = await client.query(
          `INSERT INTO staff (id, employee_id, full_name, email, phone, site_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [uuidv4(), empId, name, email, phone, siteId, req.hrUser?.id || null]
        );
        imported.push(inserted[0]);
        seenInFile.add(empId);
        existingIds.add(empId.toLowerCase());
      } catch (err) {
        if (err.code === '23505') {
          duplicates.push({ row: rowNum, column: 'Employee ID', employee_id: empId, error: 'Employee ID already exists', data: row });
        } else {
          failed.push({ row: rowNum, employee_id: empId, error: err.message, data: row });
        }
      }
    }

    res.json({
      success: true,
      importedCount: imported.length,
      duplicateCount: duplicates.length,
      failedCount: failed.length,
      imported,
      duplicates,
      failed,
      errors: [...failed, ...duplicates],
    });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Bulk import failed' });
  } finally {
    client.release();
  }
});

// ── PATCH /api/staff/:id ──────────────────────────────────────────────────
router.patch(
  '/:id',
  requireWriteAccess,
  [
    body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('site_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid site ID'),
    body('department_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid department ID'),
    body('team_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid team ID'),
    body('role_title').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
    }

    const allowed = ['full_name', 'email', 'phone', 'site_id', 'status', 'department_id', 'team_id', 'role_title'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (typeof val === 'string' && !val.trim() && (key === 'email' || key === 'phone' || key === 'site_id')) {
          val = null;
        }
        updates.push(`${key} = $${idx++}`);
        values.push(val);
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
router.delete('/:id', requireWriteAccess, async (req, res) => {
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

module.exports = router;

