const crypto = require('crypto');
const pool = require('../db/pool');

/**
 * Middleware — authenticates mobile device clock-in/out requests.
 *
 * Expects headers:
 *   X-Device-Id: <device UUID>
 *   X-Device-Sig: <HMAC-SHA256 of (device_id + ':' + timestamp + ':' + body_json)>
 *   X-Timestamp:  <unix ms> (must be within ±30s of server time)
 *
 * Attaches req.device and req.staffMember on success.
 */
async function deviceAuth(req, res, next) {
  const deviceId = req.headers['x-device-id'];
  const sig = req.headers['x-device-sig'];
  const tsHeader = req.headers['x-timestamp'];

  if (!deviceId || !sig || !tsHeader) {
    return res.status(401).json({ error: 'Missing device auth headers' });
  }

  const ts = parseInt(tsHeader, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 30_000) {
    return res.status(401).json({ error: 'Timestamp out of range (±30s)' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT d.*, s.id as staff_id, s.full_name, s.employee_id, s.site_id, s.status
       FROM devices d
       JOIN staff s ON s.id = d.staff_id
       WHERE d.id = $1 AND d.is_active = true`,
      [deviceId]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Unknown or inactive device' });
    }

    const device = rows[0];

    if (device.status !== 'active') {
      return res.status(403).json({ error: 'Staff account is not active' });
    }

    // Verify HMAC signature
    const bodyStr = JSON.stringify(req.body);
    const payload = `${deviceId}:${tsHeader}:${bodyStr}`;
    const expected = crypto
      .createHmac('sha256', device.device_token)
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(401).json({ error: 'Invalid device signature' });
    }

    req.device = device;
    req.staffMember = {
      id: device.staff_id,
      full_name: device.full_name,
      employee_id: device.employee_id,
      site_id: device.site_id,
    };

    // Update last_used_at asynchronously (don't await — don't block the request)
    pool.query('UPDATE devices SET last_used_at = NOW() WHERE id = $1', [deviceId]).catch(() => {});

    next();
  } catch (err) {
    console.error('deviceAuth error:', err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = { deviceAuth };
