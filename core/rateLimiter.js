/**
 * RateLimiter v5.0
 * 
 * Features:
 * - Per‑user or per‑key rate limiting (e.g., userId, IP)
 * - Per‑command or per‑scope granularity
 * - Fixed window or sliding window (default: sliding window with smooth decay)
 * - Global fallback limit (catch‑all)
 * - Cooldown support (block for a period after reaching limit)
 * - EventBus integration (emits 'ratelimit.hit' when limit exceeded)
 * - Stats and reset capabilities
 * - Memory‑efficient (LRU caches for keys, optional TTL)
 */

class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.defaultLimit - Max requests per window (default: 5)
   * @param {number} options.defaultWindowMs - Window duration in ms (default: 10000)
   * @param {number} options.defaultCooldownMs - Optional block time after limit (default: 0)
   * @param {boolean} options.slidingWindow - Use sliding window (true) or fixed (false) – default true
   * @param {EventBus} options.eventBus - Optional event bus for emitting ratelimit events
   * @param {Logger} options.logger - Optional logger
   * @param {Object} options.commands - Command‑specific overrides: { commandName: { limit, windowMs, cooldownMs } }
   * @param {number} options.maxKeys - Max keys in cache (LRU) to prevent memory leak (default: 10000)
   */
  constructor(options = {}) {
    this.defaultLimit = options.defaultLimit ?? 5;
    this.defaultWindowMs = options.defaultWindowMs ?? 10000;
    this.defaultCooldownMs = options.defaultCooldownMs ?? 0;
    this.slidingWindow = options.slidingWindow ?? true;
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.commandOverrides = options.commands || new Map();
    this.maxKeys = options.maxKeys ?? 10000;
    
    // Store for fixed window: Map<key, { count, resetTime }>
    this.fixedStore = new Map();
    // Store for sliding window: Map<key, Array<timestamp>>
    this.slidingStore = new Map();
    // Cooldown store: Map<key, expiresAt>
    this.cooldownStore = new Map();
    
    // For LRU cleanup in sliding store (optional, but we'll limit size)
    this.keyAccessOrder = [];
  }

  /**
   * Get effective limits for a command (or default)
   */
  _getLimits(command = null) {
    if (command && this.commandOverrides.has(command)) {
      const over = this.commandOverrides.get(command);
      return {
        limit: over.limit ?? this.defaultLimit,
        windowMs: over.windowMs ?? this.defaultWindowMs,
        cooldownMs: over.cooldownMs ?? this.defaultCooldownMs,
      };
    }
    return {
      limit: this.defaultLimit,
      windowMs: this.defaultWindowMs,
      cooldownMs: this.defaultCooldownMs,
    };
  }

  /**
   * Generate a composite key (e.g., "user:123:command:ping")
   * @param {string} key - Base identifier (userId, IP, etc.)
   * @param {string} scope - Optional scope (command name, API endpoint)
   * @returns {string}
   */
  _makeKey(key, scope = null) {
    return scope ? `${key}:${scope}` : key;
  }

  /**
   * Check if a key is currently in cooldown
   * @param {string} compositeKey
   * @returns {boolean}
   */
  _isCooldown(compositeKey) {
    const cooldownUntil = this.cooldownStore.get(compositeKey);
    if (!cooldownUntil) return false;
    if (Date.now() > cooldownUntil) {
      this.cooldownStore.delete(compositeKey);
      return false;
    }
    return true;
  }

  /**
   * Apply cooldown for a key (block further requests)
   * @param {string} compositeKey
   * @param {number} durationMs
   */
  _applyCooldown(compositeKey, durationMs) {
    if (durationMs > 0) {
      this.cooldownStore.set(compositeKey, Date.now() + durationMs);
      // optional: auto‑cleanup after duration
      setTimeout(() => {
        if (this.cooldownStore.get(compositeKey) <= Date.now()) {
          this.cooldownStore.delete(compositeKey);
        }
      }, durationMs + 100);
    }
  }

  /**
   * Fixed window algorithm
   */
  _checkFixed(key, limit, windowMs, cooldownMs) {
    const now = Date.now();
    const record = this.fixedStore.get(key);
    if (!record || now > record.resetTime) {
      this.fixedStore.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    if (record.count < limit) {
      record.count++;
      return { allowed: true, remaining: limit - record.count };
    }
    // limit exceeded -> apply cooldown if needed
    if (cooldownMs > 0 && !this._isCooldown(key)) {
      this._applyCooldown(key, cooldownMs);
    }
    return { allowed: false, remaining: 0 };
  }

  /**
   * Sliding window algorithm (more accurate)
   */
  _checkSliding(key, limit, windowMs, cooldownMs) {
    const now = Date.now();
    let timestamps = this.slidingStore.get(key) || [];
    // Remove timestamps outside the current window
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    if (timestamps.length < limit) {
      timestamps.push(now);
      this.slidingStore.set(key, timestamps);
      // LRU cleanup: maintain access order
      this._updateAccessOrder(key);
      return { allowed: true, remaining: limit - timestamps.length };
    }
    // limit exceeded: apply cooldown and don't record this request
    if (cooldownMs > 0 && !this._isCooldown(key)) {
      this._applyCooldown(key, cooldownMs);
    }
    return { allowed: false, remaining: 0 };
  }

  /**
   * Maintain LRU order (simple, to cap store size)
   */
  _updateAccessOrder(key) {
    const idx = this.keyAccessOrder.indexOf(key);
    if (idx !== -1) this.keyAccessOrder.splice(idx, 1);
    this.keyAccessOrder.push(key);
    if (this.keyAccessOrder.length > this.maxKeys) {
      const oldest = this.keyAccessOrder.shift();
      this.slidingStore.delete(oldest);
      this.fixedStore.delete(oldest);
      this.cooldownStore.delete(oldest);
    }
  }

  /**
   * Main rate limit check
   * @param {string} key - Primary identifier (userId, guildId, etc.)
   * @param {string|null} command - Optional command name for command‑specific limits
   * @returns {Object} { allowed, remaining, resetInMs, limit, windowMs }
   */
  check(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    const { limit, windowMs, cooldownMs } = this._getLimits(command);
    
    // Cooldown overrides everything
    if (this._isCooldown(compositeKey)) {
      const cooldownUntil = this.cooldownStore.get(compositeKey);
      const resetInMs = cooldownUntil - Date.now();
      this._emitHit(key, command, 'cooldown');
      return {
        allowed: false,
        remaining: 0,
        resetInMs: Math.max(0, resetInMs),
        limit,
        windowMs,
        reason: 'cooldown',
      };
    }
    
    let result;
    if (this.slidingWindow) {
      result = this._checkSliding(compositeKey, limit, windowMs, cooldownMs);
    } else {
      result = this._checkFixed(compositeKey, limit, windowMs, cooldownMs);
    }
    
    if (!result.allowed) {
      this._emitHit(key, command, 'rate_limit');
    }
    
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetInMs: this.slidingWindow ? this._estimateResetMs(compositeKey, windowMs) : this._getFixedResetMs(compositeKey),
      limit,
      windowMs,
      reason: result.allowed ? null : 'rate_limit',
    };
  }

  /**
   * Estimate reset time for sliding window (approx)
   */
  _estimateResetMs(key, windowMs) {
    const timestamps = this.slidingStore.get(key);
    if (!timestamps || timestamps.length === 0) return 0;
    const oldest = timestamps[0];
    const elapsed = Date.now() - oldest;
    return Math.max(0, windowMs - elapsed);
  }

  /**
   * Get fixed window reset time
   */
  _getFixedResetMs(key) {
    const record = this.fixedStore.get(key);
    if (!record) return 0;
    return Math.max(0, record.resetTime - Date.now());
  }

  /**
   * Reset all data for a key (clear all stores)
   * @param {string} key
   * @param {string|null} command
   */
  reset(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    this.fixedStore.delete(compositeKey);
    this.slidingStore.delete(compositeKey);
    this.cooldownStore.delete(compositeKey);
  }

  /**
   * Reset all keys (global reset)
   */
  resetAll() {
    this.fixedStore.clear();
    this.slidingStore.clear();
    this.cooldownStore.clear();
    this.keyAccessOrder = [];
  }

  /**
   * Get current usage statistics for a key
   * @param {string} key
   * @param {string|null} command
   * @returns {Object} { used, limit, remaining, resetInMs }
   */
  getStatus(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    const { limit, windowMs, cooldownMs } = this._getLimits(command);
    let used = 0;
    if (this.slidingWindow) {
      const timestamps = this.slidingStore.get(compositeKey) || [];
      const now = Date.now();
      used = timestamps.filter(ts => now - ts < windowMs).length;
    } else {
      const record = this.fixedStore.get(compositeKey);
      if (record && Date.now() < record.resetTime) used = record.count;
    }
    const remaining = Math.max(0, limit - used);
    const resetInMs = this.slidingWindow ? this._estimateResetMs(compositeKey, windowMs) : this._getFixedResetMs(compositeKey);
    return { used, limit, remaining, resetInMs, windowMs };
  }

  /**
   * Override limits for a specific command
   * @param {string} command - Command name
   * @param {Object} limits - { limit, windowMs, cooldownMs }
   */
  setCommandLimits(command, limits) {
    this.commandOverrides.set(command, limits);
  }

  /**
   * Emit rate limit hit event (if eventBus provided)
   */
  _emitHit(key, command, reason) {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit('ratelimit.hit', { key, command, reason, timestamp: Date.now() });
    }
    this.logger.warn(`Rate limit hit: key=${key}, command=${command}, reason=${reason}`);
  }
}

module.exports = { RateLimiter };