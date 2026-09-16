const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authJwt } = require('../middleware/authJwt');

const router = express.Router();
router.use(authJwt);

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, data, read_at, created_at FROM notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.hrUser.id, limit],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.post('/tokens', [
  body('token').trim().isLength({ min: 10 }),
  body('platform').isIn(['expo', 'ios', 'android', 'web']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid notification token', errors: errors.array() });
  try {
    await pool.query(
      `INSERT INTO notification_tokens (id, user_id, token, platform)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
         is_active = true, last_used_at = NOW()`,
      [uuidv4(), req.hrUser.id, req.body.token, req.body.platform],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register notification token' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2',
      [req.params.id, req.hrUser.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

module.exports = router;
