const crypto = require('crypto');
const pool = require('../db/pool');

/**
 * Middleware — authenticates mobile device clock-in/out requests.
 *
 * Expects headers:
 *   X-Device-Id: <device UUID>
 *   X-Device-Sig: <base64 Ed25519 signature, or legacy HMAC hex>
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
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 120_000) {
    return res.status(401).json({ error: 'Timestamp out of range. Check the device clock and try again.' });
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

    const bodyStr = JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {});
    const payload = `${deviceId}:${tsHeader}:${bodyStr}`;
    const isEd25519 = String(req.headers['x-device-sig-alg'] || '').toLowerCase() === 'ed25519';
    let validSignature = false;
    if (isEd25519 && device.public_key_b64) {
      validSignature = crypto.verify(
        null,
        Buffer.from(payload),
        { key: Buffer.from(device.public_key_b64, 'base64'), format: 'der', type: 'spki' },
        Buffer.from(String(sig), 'base64'),
      );
    } else {
      const expected = crypto.createHmac('sha256', device.device_token).update(payload).digest('hex');
      const sigBuf = Buffer.from(String(sig), 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      validSignature = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    }
    if (!validSignature) {
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
