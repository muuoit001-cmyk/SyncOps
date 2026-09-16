require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const sitesRoutes = require('./routes/sites');
const attendanceRoutes = require('./routes/attendance');
const devicesRoutes = require('./routes/devices');
const { ensureSchema } = require('./db/ensureSchema');
const shiftsRoutes = require('./routes/shifts');
const notificationsRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');

const app = express();
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  const weakSecrets = [
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET],
  ].filter(([, value]) => !value || value.length < 32 || value.includes('change-in-production'));
  if (weakSecrets.length) {
    throw new Error(`Refusing to start with weak production secrets: ${weakSecrets.map(([name]) => name).join(', ')}`);
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*')) {
    throw new Error('CORS_ORIGIN must explicitly list trusted production origins');
  }
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── Security ──────────────────────────────────────────────────────────────
const rawCors = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = rawCors.split(',').map((o) => o.trim().replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(cleanOrigin)
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});

// Stricter limiter for clock-in (prevents rapid fire submissions)
const clockLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
  message: { error: 'Too many clock actions. Please wait before trying again.' },
});

app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/attendance/clock', clockLimiter); // apply clock limiter first
app.use('/api/attendance', attendanceRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

ensureSchema()
  .then(() => console.log('   Database schema verified'))
  .catch((err) => console.error('   Schema verify failed:', err.message));

app.listen(PORT, () => {
  console.log(`\n🚀 SyncOps API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
