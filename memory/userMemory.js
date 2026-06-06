/**
 * 🧠 UserMemory v5.0
 * - Per‑user key‑value store (namespaced by userId)
 * - TTL support (auto‑expiration)
 * - LRU eviction (prevents memory bloat)
 * - EventBus integration (emits on set, delete, expire)
 * - Batch operations (getAll, setMultiple)
 * - Optional custom serializer/deserializer
 */
const EventEmitter = require('events');

class UserMemory {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10000;        // max total entries across all users
    this.defaultTtl = options.defaultTtl || 0;      // milliseconds (0 = never expires)
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.serialize = options.serialize || ((v) => v);
    this.deserialize = options.deserialize || ((v) => v);
    
    // storage: Map<compositeKey, { value, expiresAt, lastAccessed }>
    this.storage = new Map();
    // LRU tracking (ordered list of keys)
    this.accessOrder = [];
  }

  // 📡 Emit event (if eventBus provided)
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  // 🔑 Build composite key: userId:key
  _makeKey(userId, key) {
    return `${userId}:${key}`;
  }

  // 🔄 Update LRU order (move key to most recent)
  _updateLRU(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }

  // 🧹 Evict oldest entries if storage exceeds maxSize
  _evictIfNeeded() {
    while (this.storage.size > this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      this.storage.delete(oldestKey);
      this._emit('memory.evicted', { key: oldestKey });
      this.logger.debug(`🧠 UserMemory evicted: ${oldestKey}`);
    }
  }

  // 🧹 Clean expired entries (call periodically or on access)
  _cleanExpired() {
    const now = Date.now();
    let expired = [];
    for (const [key, data] of this.storage.entries()) {
      if (data.expiresAt && now >= data.expiresAt) {
        expired.push(key);
      }
    }
    for (const key of expired) {
      this.storage.delete(key);
      const idx = this.accessOrder.indexOf(key);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this._emit('memory.expired', { key });
    }
    if (expired.length) this.logger.debug(`🧹 Cleaned ${expired.length} expired entries`);
  }

  /**
   * 💾 Set a value for a user
   * @param {string} userId - Discord user ID
   * @param {string} key - Key name
   * @param {any} value - Value (will be serialized)
   * @param {number} ttl - Optional TTL in ms (overrides default)
   */
  set(userId, key, value, ttl = null) {
    this._cleanExpired();
    const compositeKey = this._makeKey(userId, key);
    const expiresAt = ttl !== null ? Date.now() + ttl : (this.defaultTtl ? Date.now() + this.defaultTtl : null);
    const serialized = this.serialize(value);
    this.storage.set(compositeKey, {
      value: serialized,
      expiresAt,
      lastAccessed: Date.now(),
    });
    this._updateLRU(compositeKey);
    this._evictIfNeeded();
    this._emit('memory.set', { userId, key, value });
    return this;
  }

  /**
   * 🔍 Get a value for a user
   * @param {string} userId
   * @param {string} key
   * @param {any} defaultValue - Returned if key not found or expired
   * @returns {any}
   */
  get(userId, key, defaultValue = null) {
    this._cleanExpired();
    const compositeKey = this._makeKey(userId, key);
    const data = this.storage.get(compositeKey);
    if (!data) return defaultValue;
    // Check expiration again (in case TTL passed since last clean)
    if (data.expiresAt && Date.now() >= data.expiresAt) {
      this.delete(userId, key);
      return defaultValue;
    }
    data.lastAccessed = Date.now();
    this._updateLRU(compositeKey);
    return this.deserialize(data.value);
  }

  /**
   * 🗑️ Delete a specific key for a user
   * @param {string} userId
   * @param {string} key
   * @returns {boolean} True if existed
   */
  delete(userId, key) {
    const compositeKey = this._makeKey(userId, key);
    const existed = this.storage.delete(compositeKey);
    if (existed) {
      const idx = this.accessOrder.indexOf(compositeKey);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this._emit('memory.delete', { userId, key });
    }
    return existed;
  }

  /**
   * 🧹 Delete all keys for a user
   * @param {string} userId
   * @returns {number} Number of entries deleted
   */
  deleteUser(userId) {
    const prefix = `${userId}:`;
    const toDelete = [];
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) toDelete.push(key);
    }
    for (const key of toDelete) {
      this.storage.delete(key);
      const idx = this.accessOrder.indexOf(key);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
    }
    if (toDelete.length) this._emit('memory.user.deleted', { userId, count: toDelete.length });
    return toDelete.length;
  }

  /**
   * 📋 Get all keys and values for a user
   * @param {string} userId
   * @returns {Object} Key-value map
   */
  getAll(userId) {
    this._cleanExpired();
    const prefix = `${userId}:`;
    const result = {};
    for (const [key, data] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const actualKey = key.slice(prefix.length);
        if (data.expiresAt && Date.now() >= data.expiresAt) {
          this.delete(userId, actualKey);
          continue;
        }
        result[actualKey] = this.deserialize(data.value);
      }
    }
    return result;
  }

  /**
   * ✨ Set multiple keys for a user at once
   * @param {string} userId
   * @param {Object} keyValues - Object mapping keys to values
   * @param {number} ttl - Optional TTL for all
   */
  setMultiple(userId, keyValues, ttl = null) {
    for (const [key, value] of Object.entries(keyValues)) {
      this.set(userId, key, value, ttl);
    }
  }

  /**
   * 🔢 Check if a key exists (and not expired)
   * @param {string} userId
   * @param {string} key
   * @returns {boolean}
   */
  has(userId, key) {
    return this.get(userId, key, null) !== null;
  }

  /**
   * ⏰ Get remaining TTL for a key (in ms)
   * @param {string} userId
   * @param {string} key
   * @returns {number} 0 if expired or not exist, -1 if never expires, else ms remaining
   */
  getTTL(userId, key) {
    const compositeKey = this._makeKey(userId, key);
    const data = this.storage.get(compositeKey);
    if (!data) return 0;
    if (!data.expiresAt) return -1;
    const remaining = data.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * 🔄 Refresh TTL for a key (reset expiration)
   * @param {string} userId
   * @param {string} key
   * @param {number} ttl - New TTL in ms (overrides previous)
   * @returns {boolean} True if key existed
   */
  refreshTTL(userId, key, ttl) {
    const compositeKey = this._makeKey(userId, key);
    const data = this.storage.get(compositeKey);
    if (!data) return false;
    data.expiresAt = Date.now() + ttl;
    this._updateLRU(compositeKey);
    return true;
  }

  /**
   * 🧹 Clear all memory (all users)
   */
  clear() {
    this.storage.clear();
    this.accessOrder = [];
    this._emit('memory.clear');
    this.logger.info('🧠 UserMemory cleared');
  }

  /**
   * 📊 Get statistics
   * @returns {Object} { size, maxSize, expiredCount, lastClean }
   */
  stats() {
    this._cleanExpired();
    return {
      size: this.storage.size,
      maxSize: this.maxSize,
      expiredCount: 0, // not tracked, but we can compute on demand if needed
      lastClean: Date.now(),
    };
  }

  /**
   * 🧹 Force expire all expired entries (call periodically)
   */
  cleanExpired() {
    this._cleanExpired();
  }
}

module.exports = UserMemory;
