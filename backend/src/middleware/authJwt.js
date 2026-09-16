const jwt = require('jsonwebtoken');

/**
 * Middleware — verifies HR dashboard JWT access token.
 * Attaches decoded user payload to req.hrUser.
 */
function authJwt(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.hrUser = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role guard — require hr_admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.hrUser || req.hrUser.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

function requireWriteAccess(req, res, next) {
  if (req.hrUser?.role === 'hr') {
    return res.status(403).json({ error: 'Read-only HR accounts cannot modify staff, sites, or schedules' });
  }
  next();
}

module.exports = { authJwt, requireAdmin, requireWriteAccess };
