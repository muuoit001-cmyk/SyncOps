const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { TOTP } = require('otpauth');
const QRCode = require('qrcode');
const pool = require('../db/pool');

const router = express.Router();

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, totpCode } = req.body;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM hr_users WHERE email = $1 AND is_active = true',
        [email]
      );
      if (!rows.length) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = rows[0];

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      // 2FA check
      if (user.totp_enabled) {
        if (!totpCode) {
          return res.status(200).json({ requiresTotp: true });
        }
        const totp = new TOTP({ secret: user.totp_secret, algorithm: 'SHA1', digits: 6, period: 30 });
        const delta = totp.validate({ token: totpCode, window: 1 });
        if (delta === null) {
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken();
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
        [uuidv4(), user.id, refreshHash]
      );

      await pool.query('UPDATE hr_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
      });
    } catch (err) {
      console.error('login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  try {
    const { rows } = await pool.query(
      `SELECT rt.*, u.id as uid, u.email, u.role, u.full_name, u.is_active
       FROM refresh_tokens rt
       JOIN hr_users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const row = rows[0];
    if (!row.is_active) return res.status(403).json({ error: 'Account deactivated' });

    const accessToken = generateAccessToken({
      id: row.uid, email: row.email, role: row.role, full_name: row.full_name,
    });
    res.json({ accessToken });
  } catch (err) {
    console.error('refresh error:', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]).catch(() => {});
  }
  res.json({ ok: true });
});

// ── POST /api/auth/totp/setup ──────────────────────────────────────────────
router.post('/totp/setup', require('../middleware/authJwt').authJwt, async (req, res) => {
  try {
    const secret = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30 }).secret.base32;
    await pool.query('UPDATE hr_users SET totp_secret = $1, totp_enabled = false WHERE id = $2', [
      secret, req.hrUser.id,
    ]);
    const uri = `otpauth://totp/SyncOps:${req.hrUser.email}?secret=${secret}&issuer=SyncOps`;
    const qr = await QRCode.toDataURL(uri);
    res.json({ secret, qrCode: qr });
  } catch (err) {
    res.status(500).json({ error: 'TOTP setup failed' });
  }
});

// ── POST /api/auth/totp/confirm ────────────────────────────────────────────
router.post('/totp/confirm', require('../middleware/authJwt').authJwt, async (req, res) => {
  const { totpCode } = req.body;
  try {
    const { rows } = await pool.query('SELECT totp_secret FROM hr_users WHERE id = $1', [req.hrUser.id]);
    if (!rows.length || !rows[0].totp_secret) {
      return res.status(400).json({ error: 'TOTP not initialized' });
    }
    const totp = new TOTP({ secret: rows[0].totp_secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) return res.status(400).json({ error: 'Invalid code' });

    await pool.query('UPDATE hr_users SET totp_enabled = true WHERE id = $1', [req.hrUser.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'TOTP confirm failed' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', require('../middleware/authJwt').authJwt, (req, res) => {
  res.json(req.hrUser);
});

module.exports = router;
