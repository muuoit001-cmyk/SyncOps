const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { TOTP } = require('otpauth');
const QRCode = require('qrcode');
const pool = require('../db/pool');
const { getSupabaseUser } = require('../utils/supabaseAuth');

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

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid work email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').trim().isLength({ min: 2 }).withMessage('Full name is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
    }

    const { email, password, full_name, auth_user_id } = req.body;
    try {
      const existing = await pool.query('SELECT id, is_active FROM hr_users WHERE email = $1', [email]);
      if (existing.rows.length) {
        if (!existing.rows[0].is_active) {
          return res.status(409).json({
            error: 'An account with this email is already registered but pending activation. Please check your email.',
            code: 'PENDING_ACTIVATION',
          });
        }
        return res.status(409).json({ error: 'An account with this work email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = uuidv4();
      const activationToken = jwt.sign(
        { id: userId, email, purpose: 'activation' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      const { rows } = await pool.query(
        `INSERT INTO hr_users (id, email, password_hash, full_name, role, is_active, auth_user_id)
         VALUES ($1, $2, $3, $4, 'hr_manager', false, $5)
         RETURNING id, email, full_name, role, is_active`,
        [userId, email, passwordHash, full_name.trim(), auth_user_id || null]
      );

      res.status(201).json({
        message: 'Registration successful! An activation link has been sent to your work email.',
        user: rows[0],
        ...(process.env.NODE_ENV !== 'production' ? { activationLink: `/activate?token=${activationToken}&email=${encodeURIComponent(email)}` } : {}),
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Failed to register account' });
    }
  }
);

// ── POST /api/auth/activate ────────────────────────────────────────────────
router.post('/activate', async (req, res) => {
  const { token, email } = req.body;
  if (!token && !email) {
    return res.status(400).json({ error: 'Activation token or email is required' });
  }

  try {
    let targetEmail = email;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        targetEmail = decoded.email;
      } catch (tokenErr) {
        return res.status(400).json({ error: 'Activation link has expired or is invalid.' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE hr_users SET is_active = true, updated_at = NOW() WHERE LOWER(email) = LOWER($1) RETURNING id, email, full_name, role, is_active`,
      [targetEmail]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      success: true,
      message: 'Account activated successfully! You can now sign in with your credentials.',
      user: rows[0],
    });
  } catch (err) {
    console.error('Activation error:', err);
    res.status(500).json({ error: 'Failed to activate account' });
  }
});

// ── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    try {
      const { rows } = await pool.query('SELECT id, email, full_name FROM hr_users WHERE email = $1', [email]);
      if (!rows.length) {
        // Return generic message to prevent email enumeration
        return res.json({
          message: 'If an account exists with this email, a password reset link has been sent.',
        });
      }

      const user = rows[0];
      const resetToken = jwt.sign(
        { id: user.id, email: user.email, purpose: 'reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        message: 'If an account exists with this email, a password reset link has been sent.',
        ...(process.env.NODE_ENV !== 'production' ? { resetLink: `/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}` } : {}),
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }
);

// ── POST /api/auth/reset-password ──────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { token, password } = req.body;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.purpose !== 'reset') {
        return res.status(400).json({ error: 'Invalid reset token' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `UPDATE hr_users SET password_hash = $1, is_active = true WHERE id = $2 RETURNING id, email`,
        [passwordHash, payload.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'User account not found' });
      }

      res.json({
        success: true,
        message: 'Password reset successfully! You can now sign in with your new password.',
      });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
    }
  }
);

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
        'SELECT * FROM hr_users WHERE email = $1',
        [email]
      );
      if (!rows.length) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = rows[0];

      if (!user.is_active) {
        return res.status(403).json({
          error: 'Your account has not been activated yet. Please click the activation link sent to your work email.',
          code: 'ACCOUNT_NOT_ACTIVATED',
        });
      }

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
        user: { id: user.id, email: user.email, role: user.role, name: user.full_name, full_name: user.full_name },
      });
    } catch (err) {
      console.error('login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

async function issueSession(user, res) {
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
    user: { id: user.id, email: user.email, role: user.role, name: user.full_name, full_name: user.full_name },
  });
}

// ── POST /api/auth/supabase-login ────────────────────────────────────────
router.post('/supabase-login', async (req, res) => {
  const { accessToken, password } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'Supabase access token is required' });

  try {
    const sbUser = await getSupabaseUser(accessToken);
    if (!sbUser?.email) {
      return res.status(401).json({ error: 'Invalid or expired verification session' });
    }

    const emailConfirmed = !!(sbUser.email_confirmed_at || sbUser.confirmed_at);
    if (!emailConfirmed) {
      return res.status(403).json({
        error: 'Your work email has not been verified yet. Please click the activation link in your inbox.',
        code: 'ACCOUNT_NOT_ACTIVATED',
      });
    }

    const { rows } = await pool.query(
      'SELECT * FROM hr_users WHERE LOWER(email) = LOWER($1)',
      [sbUser.email]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: 'No SyncOps HR profile is linked to this email. Please register first.',
      });
    }

    const user = rows[0];
    const updates = ['is_active = true'];
    const values = [];
    let idx = 1;
    if (sbUser.id && user.auth_user_id !== sbUser.id) {
      updates.push(`auth_user_id = $${idx++}`);
      values.push(sbUser.id);
    }
    if (password) {
      updates.push(`password_hash = $${idx++}`);
      values.push(await bcrypt.hash(password, 12));
    }
    values.push(user.id);
    await pool.query(
      `UPDATE hr_users SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    await issueSession({ ...user, is_active: true }, res);
  } catch (err) {
    console.error('supabase-login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

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
  res.json({
    id: req.hrUser.id,
    email: req.hrUser.email,
    role: req.hrUser.role,
    name: req.hrUser.name,
    full_name: req.hrUser.name || req.hrUser.full_name,
  });
});

module.exports = router;
