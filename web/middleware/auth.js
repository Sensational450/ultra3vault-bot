/**
 * 🔒 Authentication Middleware v5.0
 * - Validates API key from header (x-admin-key) or query (?key=...)
 * - Optional IP whitelisting (allow specific IPs only)
 * - Optional rate limiting per IP (prevents brute force)
 * - Logs all unauthorized attempts
 * - Works with environment variables: ADMIN_API_KEY, ALLOWED_ADMIN_IPS
 */
module.exports = (options = {}) => {
  const {
    apiKey = process.env.ADMIN_API_KEY,
    allowedIPs = process.env.ALLOWED_ADMIN_IPS ? process.env.ALLOWED_ADMIN_IPS.split(',') : null,
    rateLimit = options.rateLimit !== undefined ? options.rateLimit : true,
    maxAttempts = options.maxAttempts || 5,
    blockDurationMs = options.blockDurationMs || 600000, // 10 minutes
    logger = console,
  } = options;

  // 🚨 If no API key is configured, block all requests (security)
  if (!apiKey) {
    logger.error('❌ ADMIN_API_KEY is not set! Auth middleware will deny all admin requests.');
  }

  // 📊 Rate limiting store (IP -> { count, blockedUntil })
  const attemptStore = new Map();

  const getClientIP = (req) => {
    // Check Cloudflare / proxy headers first
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress || req.ip;
  };

  const isIPBlocked = (ip) => {
    const record = attemptStore.get(ip);
    if (record && record.blockedUntil && Date.now() < record.blockedUntil) {
      return true;
    }
    if (record && record.blockedUntil && Date.now() >= record.blockedUntil) {
      attemptStore.delete(ip);
      return false;
    }
    return false;
  };

  const recordFailedAttempt = (ip) => {
    if (!rateLimit) return;
    const record = attemptStore.get(ip) || { count: 0, blockedUntil: null };
    record.count++;
    if (record.count >= maxAttempts) {
      record.blockedUntil = Date.now() + blockDurationMs;
      logger.warn(`🚫 IP ${ip} blocked for ${Math.round(blockDurationMs / 1000)}s due to too many auth failures`);
    }
    attemptStore.set(ip, record);
  };

  const resetFailedAttempts = (ip) => {
    attemptStore.delete(ip);
  };

  /**
   * 🚀 Express middleware
   */
  return (req, res, next) => {
    const clientIP = getClientIP(req);

    // 1. IP whitelist check (if any IPs are specified)
    if (allowedIPs && Array.isArray(allowedIPs) && allowedIPs.length > 0) {
      if (!allowedIPs.includes(clientIP)) {
        logger.warn(`🔒 Blocked admin request from non-whitelisted IP: ${clientIP}`);
        return res.status(403).json({ error: 'Forbidden: IP not allowed' });
      }
    }

    // 2. Rate limit check (if enabled)
    if (rateLimit && isIPBlocked(clientIP)) {
      logger.warn(`⏱️ Rate‑limited admin request from blocked IP: ${clientIP}`);
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    // 3. Extract API key from header or query parameter
    const providedKey = req.headers['x-admin-key'] || req.query.key;
    if (!apiKey || !providedKey || providedKey !== apiKey) {
      recordFailedAttempt(clientIP);
      logger.warn(`🔑 Unauthorized admin access attempt from IP ${clientIP}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    // 4. Success – clear failure record and proceed
    resetFailedAttempts(clientIP);
    next();
  };
};