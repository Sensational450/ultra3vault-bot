/**
 * 🧩 Cache v5.0 (LRU in‑memory)
 * - Generic key‑value cache with TTL
 * - LRU eviction (max size)
 * - Event bus integration (on set, delete, evict)
 * - Works with any JavaScript value
 */
class Cache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 0; // ms, 0 = no expiry
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.storage = new Map();      // key -> { value, expiresAt, lastAccessed }
    this.accessOrder = [];         // LRU order (most recent at end)
  }

  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  _updateLRU(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }

  _evictIfNeeded() {
    while (this.storage.size > this.maxSize && this.accessOrder.length) {
      const oldest = this.accessOrder.shift();
      this.storage.delete(oldest);
      this._emit('cache.evicted', { key: oldest });
      this.logger.debug(`🗑️ Cache evicted: ${oldest}`);
    }
  }

  _cleanExpired() {
    const now = Date.now();
    const expired = [];
    for (const [key, data] of this.storage.entries()) {
      if (data.expiresAt && now >= data.expiresAt) expired.push(key);
    }
    for (const key of expired) {
      this.storage.delete(key);
      const idx = this.accessOrder.indexOf(key);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this._emit('cache.expired', { key });
    }
    if (expired.length) this.logger.debug(`🧹 Cache cleaned: ${expired.length} expired`);
  }

  /**
   * 💾 Set a value in the cache
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - Time to live in ms (overrides default)
   * @returns {Cache} this
   */
  set(key, value, ttl = null) {
    this._cleanExpired();
    const expiresAt = ttl !== null ? Date.now() + ttl : (this.defaultTtl ? Date.now() + this.defaultTtl : null);
    this.storage.set(key, { value, expiresAt, lastAccessed: Date.now() });
    this._updateLRU(key);
    this._evictIfNeeded();
    this._emit('cache.set', { key });
    return this;
  }

  /**
   * 🔍 Get a value from the cache
   * @param {string} key
   * @param {any} defaultValue
   * @returns {any}
   */
  get(key, defaultValue = null) {
    this._cleanExpired();
    const data = this.storage.get(key);
    if (!data) return defaultValue;
    if (data.expiresAt && Date.now() >= data.expiresAt) {
      this.delete(key);
      return defaultValue;
    }
    data.lastAccessed = Date.now();
    this._updateLRU(key);
    return data.value;
  }

  /**
   * 🗑️ Delete a key from the cache
   * @param {string} key
   * @returns {boolean} True if existed
   */
  delete(key) {
    const existed = this.storage.delete(key);
    if (existed) {
      const idx = this.accessOrder.indexOf(key);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this._emit('cache.delete', { key });
    }
    return existed;
  }

  /**
   * 🔢 Check if a key exists (and not expired)
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key, undefined) !== undefined;
  }

  /**
   * 🧹 Clear the entire cache
   */
  clear() {
    this.storage.clear();
    this.accessOrder = [];
    this._emit('cache.clear');
    this.logger.info('🧹 Cache cleared');
  }

  /**
   * 📊 Get cache statistics
   * @returns {Object}
   */
  stats() {
    this._cleanExpired();
    return {
      size: this.storage.size,
      maxSize: this.maxSize,
      keys: Array.from(this.storage.keys()),
    };
  }
}

module.exports = Cache;