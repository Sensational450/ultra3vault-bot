/**
 * RateLimiter v5.0
 * - Fixed or sliding window
 * - Per‑command overrides
 * - Cooldowns
 * - EventBus integration
 * - LRU cache to prevent memory leak
 */
class RateLimiter {
  constructor(options = {}) {
    this.defaultLimit = options.defaultLimit ?? 5;
    this.defaultWindowMs = options.defaultWindowMs ?? 10000;
    this.defaultCooldownMs = options.defaultCooldownMs ?? 0;
    this.slidingWindow = options.slidingWindow ?? true;
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.commandOverrides = options.commands ?? new Map();
    this.maxKeys = options.maxKeys ?? 10000;

    this.fixedStore = new Map();
    this.slidingStore = new Map();
    this.cooldownStore = new Map();
    this.keyAccessOrder = [];
  }

  _getLimits(command = null) {
    if (command && this.commandOverrides.has(command)) {
      const ov = this.commandOverrides.get(command);
      return {
        limit: ov.limit ?? this.defaultLimit,
        windowMs: ov.windowMs ?? this.defaultWindowMs,
        cooldownMs: ov.cooldownMs ?? this.defaultCooldownMs,
      };
    }
    return {
      limit: this.defaultLimit,
      windowMs: this.defaultWindowMs,
      cooldownMs: this.defaultCooldownMs,
    };
  }

  _makeKey(key, scope = null) {
    return scope ? `${key}:${scope}` : key;
  }

  _isCooldown(compositeKey) {
    const until = this.cooldownStore.get(compositeKey);
    if (!until) return false;
    if (Date.now() > until) {
      this.cooldownStore.delete(compositeKey);
      return false;
    }
    return true;
  }

  _applyCooldown(compositeKey, durationMs) {
    if (durationMs <= 0) return;
    this.cooldownStore.set(compositeKey, Date.now() + durationMs);
    setTimeout(() => {
      if (this.cooldownStore.get(compositeKey) <= Date.now()) {
        this.cooldownStore.delete(compositeKey);
      }
    }, durationMs + 100);
  }

  _checkFixed(key, limit, windowMs, cooldownMs) {
    const now = Date.now();
    const rec = this.fixedStore.get(key);
    if (!rec || now > rec.resetTime) {
      this.fixedStore.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    if (rec.count < limit) {
      rec.count++;
      return { allowed: true, remaining: limit - rec.count };
    }
    if (cooldownMs > 0 && !this._isCooldown(key)) this._applyCooldown(key, cooldownMs);
    return { allowed: false, remaining: 0 };
  }

  _checkSliding(key, limit, windowMs, cooldownMs) {
    const now = Date.now();
    let timestamps = this.slidingStore.get(key) || [];
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    if (timestamps.length < limit) {
      timestamps.push(now);
      this.slidingStore.set(key, timestamps);
      this._updateAccessOrder(key);
      return { allowed: true, remaining: limit - timestamps.length };
    }
    if (cooldownMs > 0 && !this._isCooldown(key)) this._applyCooldown(key, cooldownMs);
    return { allowed: false, remaining: 0 };
  }

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

  _estimateResetMs(key, windowMs) {
    const timestamps = this.slidingStore.get(key);
    if (!timestamps?.length) return 0;
    const oldest = timestamps[0];
    const elapsed = Date.now() - oldest;
    return Math.max(0, windowMs - elapsed);
  }

  _getFixedResetMs(key) {
    const rec = this.fixedStore.get(key);
    return rec ? Math.max(0, rec.resetTime - Date.now()) : 0;
  }

  check(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    const { limit, windowMs, cooldownMs } = this._getLimits(command);
    if (this._isCooldown(compositeKey)) {
      const resetInMs = this.cooldownStore.get(compositeKey) - Date.now();
      this._emitHit(key, command, 'cooldown');
      return { allowed: false, remaining: 0, resetInMs: Math.max(0, resetInMs), limit, windowMs, reason: 'cooldown' };
    }
    let result;
    if (this.slidingWindow) result = this._checkSliding(compositeKey, limit, windowMs, cooldownMs);
    else result = this._checkFixed(compositeKey, limit, windowMs, cooldownMs);
    if (!result.allowed) this._emitHit(key, command, 'rate_limit');
    const resetInMs = this.slidingWindow ? this._estimateResetMs(compositeKey, windowMs) : this._getFixedResetMs(compositeKey);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetInMs,
      limit,
      windowMs,
      reason: result.allowed ? null : 'rate_limit',
    };
  }

  _emitHit(key, command, reason) {
    if (this.eventBus?.emit) this.eventBus.emit('ratelimit.hit', { key, command, reason, timestamp: Date.now() });
    this.logger.warn(`Rate limit hit: key=${key}, command=${command}, reason=${reason}`);
  }

  reset(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    this.fixedStore.delete(compositeKey);
    this.slidingStore.delete(compositeKey);
    this.cooldownStore.delete(compositeKey);
  }

  resetAll() {
    this.fixedStore.clear();
    this.slidingStore.clear();
    this.cooldownStore.clear();
    this.keyAccessOrder = [];
  }

  getStatus(key, command = null) {
    const compositeKey = this._makeKey(key, command);
    const { limit, windowMs } = this._getLimits(command);
    let used = 0;
    if (this.slidingWindow) {
      const timestamps = this.slidingStore.get(compositeKey) || [];
      used = timestamps.filter(ts => Date.now() - ts < windowMs).length;
    } else {
      const rec = this.fixedStore.get(compositeKey);
      if (rec && Date.now() < rec.resetTime) used = rec.count;
    }
    const remaining = Math.max(0, limit - used);
    const resetInMs = this.slidingWindow ? this._estimateResetMs(compositeKey, windowMs) : this._getFixedResetMs(compositeKey);
    return { used, limit, remaining, resetInMs, windowMs };
  }

  setCommandLimits(command, limits) {
    this.commandOverrides.set(command, limits);
  }
}

module.exports = { RateLimiter };