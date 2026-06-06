/**
 * 🔒 Authentication Middleware v5.0
 * - Validates API key from header (x-admin-key) or query (?key=...)
 * - Optional IP whitelisting
 * - Optional rate limiting per IP (to prevent brute force)
 * - Logs unauthorized attempts
 */
module.exports = (options = {}) => {
  const {
    apiKey = process.env.ADMIN_API_KEY,
    allowedIPs = null,           // Array of allowed IPs (e.g., ['1.2.3.4'])
    rateLimit = false,           // Enable rate limiting per IP
    maxAttempts = 5,             // Max unauthorized attempts per IP
    blockDurationMs = 600000,    // Block IP after maxAttempts (10 minutes)
    logger = console,
  } = options;

  if (!apiKey) {
    logger.warn('⚠️ ADMIN_API_KEY not set – auth middleware will reject all requests!');
  }

  // Rate limiting store for unauthorized attempts (IP -> { count, blockedUntil })
  const attemptStore = new Map();

  const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
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
      logger.warn(`🚫 IP ${ip} blocked for ${blockDurationMs / 1000}s due to too many auth failures`);
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

    // 1. IP whitelist check (if enabled)
    if (allowedIPs && Array.isArray(allowedIPs) && !allowedIPs.includes(clientIP)) {
      logger.warn(`🔒 Blocked request from non-whitelisted IP: ${clientIP}`);
      return res.status(403).json({ error: 'Forbidden: IP not allowed' });
    }

    // 2. Rate limit check (if enabled)
    if (rateLimit && isIPBlocked(clientIP)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    // 3. Extract API key from header or query
    const providedKey = req.headers['x-admin-key'] || req.query.key;
    if (!providedKey || providedKey !== apiKey) {
      recordFailedAttempt(clientIP);
      logger.warn(`🔑 Unauthorized access attempt from IP ${clientIP}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    // 4. Success – reset failed attempts for this IP and proceed
    resetFailedAttempts(clientIP);
    next();
  };
};
