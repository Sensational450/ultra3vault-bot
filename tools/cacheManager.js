/**
 * 🗄️ CacheManager – Production Temporary Cache Service
 * 
 * Central cache for all agents with:
 * - Namespaces (per agent)
 * - TTL with automatic expiration
 * - LRU / LFU / FIFO eviction
 * - Per‑namespace limits
 * - Events & analytics
 * - Memory monitoring
 * - Health checks
 * - Redis fallback support (optional)
 * 
 * Usage:
 *   const cache = new CacheManager({ eventBus, logger });
 *   await cache.set('priceFeed', 'BTC', 45000, 30000);
 *   const price = await cache.get('priceFeed', 'BTC');
 */
const { EventEmitter } = require('events');

// ─── Helpers ───────────────────────────────────────────────────────
function estimateSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 100; // fallback
  }
}

class CacheManager {
  /**
   * @param {Object} options
   * @param {EventBus} options.eventBus - for emitting events
   * @param {Logger} options.logger - for logging
   * @param {number} options.defaultTTL - default TTL in ms (default: 60000)
   * @param {number} options.maxEntriesPerNamespace - max entries per namespace (default: 1000)
   * @param {string} options.evictionStrategy - 'lru', 'lfu', 'fifo' (default: 'lru')
   * @param {number} options.cleanupInterval - background cleanup interval (default: 60000)
   * @param {number} options.memoryThreshold - % memory usage to trigger aggressive eviction (default: 80)
   * @param {string[]} options.protectedNamespaces - namespaces never evicted (default: [])
   * @param {Object} options.redis - optional Redis client for distributed cache
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.defaultTTL = options.defaultTTL || 60000;
    this.maxEntriesPerNamespace = options.maxEntriesPerNamespace || 1000;
    this.evictionStrategy = options.evictionStrategy || 'lru';
    this.cleanupInterval = options.cleanupInterval || 60000;
    this.memoryThreshold = options.memoryThreshold || 80;
    this.protectedNamespaces = options.protectedNamespaces || [];
    this.redis = options.redis || null;

    // ─── Internal storage ──────────────────────────────────────────
    this.namespaces = new Map();        // namespace -> Map(key -> entry)
    this.metadata = new Map();          // namespace -> { created, updated, hits, misses, evictions, expired }
    this.accessOrder = new Map();       // namespace -> Map(key -> lastAccessTime) for LRU
    this.freq = new Map();              // namespace -> Map(key -> accessCount) for LFU

    this._cleanupTimer = null;
    this._stats = {
      totalSets: 0,
      totalGets: 0,
      totalHits: 0,
      totalMisses: 0,
      totalEvictions: 0,
      totalExpired: 0,
      totalMemoryUsage: 0,
    };

    this._startBackgroundCleanup();
    this._startMemoryMonitor();
  }

  // ─── Internal Helpers ────────────────────────────────────────────

  _getNamespace(ns) {
    if (!this.namespaces.has(ns)) {
      this.namespaces.set(ns, new Map());
      this.metadata.set(ns, { created: Date.now(), updated: Date.now(), hits: 0, misses: 0, evictions: 0, expired: 0 });
      this.accessOrder.set(ns, new Map());
      this.freq.set(ns, new Map());
    }
    return this.namespaces.get(ns);
  }

  _updateAccess(ns, key) {
    // Update LRU order
    const order = this.accessOrder.get(ns);
    if (order) {
      order.set(key, Date.now());
      // Keep order map sorted? We'll evict based on oldest timestamp.
    }
    // Update LFU count
    const freqMap = this.freq.get(ns);
    if (freqMap) {
      freqMap.set(key, (freqMap.get(key) || 0) + 1);
    }
  }

  _evict(ns, count = 1) {
    const store = this.namespaces.get(ns);
    if (!store) return;
    const entries = Array.from(store.entries());
    if (entries.length === 0) return;

    let toEvict = [];
    const strategy = this.evictionStrategy;

    if (strategy === 'lru') {
      const order = this.accessOrder.get(ns);
      if (order) {
        // Get keys sorted by last access time (oldest first)
        const sorted = Array.from(order.entries()).sort((a, b) => a[1] - b[1]);
        toEvict = sorted.slice(0, count).map(([key]) => key);
      } else {
        // Fallback: evict first entries
        toEvict = entries.slice(0, count).map(([key]) => key);
      }
    } else if (strategy === 'lfu') {
      const freqMap = this.freq.get(ns);
      if (freqMap) {
        const sorted = Array.from(freqMap.entries()).sort((a, b) => a[1] - b[1]);
        toEvict = sorted.slice(0, count).map(([key]) => key);
      } else {
        toEvict = entries.slice(0, count).map(([key]) => key);
      }
    } else { // fifo
      toEvict = entries.slice(0, count).map(([key]) => key);
    }

    for (const key of toEvict) {
      this._delete(ns, key, 'evict');
    }
  }

  _delete(ns, key, reason = 'delete') {
    const store = this.namespaces.get(ns);
    if (!store || !store.has(key)) return false;

    const entry = store.get(key);
    store.delete(key);
    const order = this.accessOrder.get(ns);
    if (order) order.delete(key);
    const freq = this.freq.get(ns);
    if (freq) freq.delete(key);

    const meta = this.metadata.get(ns);
    if (meta) {
      if (reason === 'expire') meta.expired++;
      else if (reason === 'evict') meta.evictions++;
    }

    this._updateStats();
    this._emit('cache:delete', { namespace: ns, key, reason });
    return true;
  }

  _updateStats() {
    let totalEntries = 0;
    let totalMemory = 0;
    for (const [ns, store] of this.namespaces) {
      totalEntries += store.size;
      for (const [, entry] of store) {
        totalMemory += entry.size || 0;
      }
    }
    this._stats.totalMemoryUsage = totalMemory;
    return { totalEntries, totalMemory };
  }

  _emit(event, data) {
    if (this.eventBus?.emit) {
      this.eventBus.emit(event, data);
    }
  }

  _startBackgroundCleanup() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    this._cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupInterval);
  }

  _startMemoryMonitor() {
    setInterval(() => {
      const mem = process.memoryUsage();
      const usagePct = (mem.heapUsed / mem.heapTotal) * 100;
      if (usagePct > this.memoryThreshold) {
        this.logger.warn(`⚠️ Cache memory high (${usagePct.toFixed(1)}%) – aggressive eviction triggered`);
        this.aggressiveEvict();
        this._emit('cache:memoryPressure', { usagePct, timestamp: Date.now() });
      }
    }, 30000); // every 30s
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Set a value in a namespace
   * @param {string} ns - namespace (e.g., 'priceFeed')
   * @param {string} key - cache key
   * @param {*} value - value to store
   * @param {number} ttl - time-to-live in ms (overrides default)
   * @param {Object} options - { protected: false, compress: false }
   * @returns {Promise<void>}
   */
  async set(ns, key, value, ttl = this.defaultTTL, options = {}) {
    if (!ns || !key) throw new Error('Namespace and key are required');
    const store = this._getNamespace(ns);
    const size = estimateSize(value);

    // Evict if over limit (unless protected)
    if (!this.protectedNamespaces.includes(ns) && store.size >= this.maxEntriesPerNamespace) {
      this._evict(ns, 1);
    }

    const entry = {
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl,
      size,
      protected: options.protected || false,
    };
    store.set(key, entry);
    this._updateAccess(ns, key);

    this._stats.totalSets++;
    this._updateStats();
    this._emit('cache:set', { namespace: ns, key, ttl, timestamp: Date.now() });

    // If Redis is configured, also set there
    if (this.redis) {
      try {
        await this.redis.setex(`${ns}:${key}`, Math.ceil(ttl / 1000), JSON.stringify(value));
      } catch (err) {
        this.logger.error(`Redis set failed: ${err.message}`);
      }
    }
  }

  /**
   * Get a value from a namespace
   * @param {string} ns - namespace
   * @param {string} key - cache key
   * @param {boolean} touch - whether to extend TTL (default: false)
   * @returns {Promise<*>} value or undefined
   */
  async get(ns, key, touch = false) {
    const store = this.namespaces.get(ns);
    if (!store) return undefined;

    const entry = store.get(key);
    if (!entry) {
      this._stats.totalMisses++;
      const meta = this.metadata.get(ns);
      if (meta) meta.misses++;
      this._emit('cache:miss', { namespace: ns, key });
      return undefined;
    }

    // Check expiration
    const now = Date.now();
    if (entry.ttl > 0 && (now - entry.createdAt) > entry.ttl) {
      this._delete(ns, key, 'expire');
      this._stats.totalExpired++;
      this._emit('cache:expire', { namespace: ns, key });
      return undefined;
    }

    this._stats.totalHits++;
    this._stats.totalGets++;
    const meta = this.metadata.get(ns);
    if (meta) meta.hits++;
    entry.lastAccessed = now;
    this._updateAccess(ns, key);

    if (touch && entry.ttl > 0) {
      // Extend TTL by resetting creation time (or extending)
      entry.createdAt = now;
    }

    this._emit('cache:hit', { namespace: ns, key, timestamp: now });
    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   */
  async has(ns, key) {
    const val = await this.get(ns, key);
    return val !== undefined;
  }

  /**
   * Delete a key from a namespace
   */
  async delete(ns, key) {
    return this._delete(ns, key, 'delete');
  }

  /**
   * Clear an entire namespace
   */
  async clear(ns) {
    const store = this.namespaces.get(ns);
    if (store) {
      store.clear();
      this.accessOrder.get(ns)?.clear();
      this.freq.get(ns)?.clear();
      this._emit('cache:clear', { namespace: ns });
    }
  }

  /**
   * Clear all namespaces
   */
  async clearAll() {
    for (const ns of this.namespaces.keys()) {
      await this.clear(ns);
    }
    this._emit('cache:clearAll', { timestamp: Date.now() });
  }

  /**
   * Extend TTL for a key (touch)
   */
  async touch(ns, key, ttl = this.defaultTTL) {
    const store = this.namespaces.get(ns);
    if (!store) return false;
    const entry = store.get(key);
    if (!entry) return false;
    entry.createdAt = Date.now();
    entry.ttl = ttl;
    this._emit('cache:touch', { namespace: ns, key, ttl });
    return true;
  }

  /**
   * Get statistics for a namespace (or all)
   */
  getStats(ns) {
    if (ns) {
      const meta = this.metadata.get(ns);
      const store = this.namespaces.get(ns);
      if (!meta) return null;
      return {
        namespace: ns,
        entries: store ? store.size : 0,
        hits: meta.hits,
        misses: meta.misses,
        hitRate: meta.hits + meta.misses > 0 ? (meta.hits / (meta.hits + meta.misses)) : 0,
        evictions: meta.evictions,
        expired: meta.expired,
        created: meta.created,
        updated: meta.updated,
      };
    }
    // Overall stats
    let totalEntries = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let totalEvictions = 0;
    let totalExpired = 0;
    for (const [ns, meta] of this.metadata) {
      const store = this.namespaces.get(ns);
      totalEntries += store ? store.size : 0;
      totalHits += meta.hits;
      totalMisses += meta.misses;
      totalEvictions += meta.evictions;
      totalExpired += meta.expired;
    }
    return {
      namespaces: this.namespaces.size,
      totalEntries,
      totalHits,
      totalMisses,
      hitRate: totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) : 0,
      totalEvictions,
      totalExpired,
      memoryUsage: this._stats.totalMemoryUsage,
      uptime: Date.now() - (this._startTime || Date.now()),
    };
  }

  /**
   * Manually cleanup expired entries in all namespaces
   * @returns {number} number of expired entries removed
   */
  cleanupExpired() {
    let total = 0;
    const now = Date.now();
    for (const [ns, store] of this.namespaces) {
      const toRemove = [];
      for (const [key, entry] of store) {
        if (entry.ttl > 0 && (now - entry.createdAt) > entry.ttl) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        this._delete(ns, key, 'expire');
        total++;
      }
    }
    if (total > 0) {
      this._stats.totalExpired += total;
      this._emit('cache:expired', { count: total, timestamp: now });
    }
    return total;
  }

  /**
   * Aggressive eviction – removes oldest/largest entries across all namespaces
   * @param {number} percent - percentage of entries to evict (default: 20)
   */
  aggressiveEvict(percent = 20) {
    let totalEvicted = 0;
    for (const [ns, store] of this.namespaces) {
      if (this.protectedNamespaces.includes(ns)) continue;
      const count = Math.max(1, Math.floor(store.size * percent / 100));
      this._evict(ns, count);
      totalEvicted += count;
    }
    if (totalEvicted > 0) {
      this._stats.totalEvictions += totalEvicted;
      this._emit('cache:aggressiveEvict', { count: totalEvicted, timestamp: Date.now() });
    }
    return totalEvicted;
  }

  /**
   * Get memory usage (approximate)
   */
  getMemoryUsage() {
    return this._stats.totalMemoryUsage;
  }

  /**
   * Health check – returns true if cache is operational
   */
  healthCheck() {
    const memUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100;
    const ok = memUsage < this.memoryThreshold;
    return {
      healthy: ok,
      memoryUsage: memUsage,
      entries: this._stats.totalEntries,
      message: ok ? 'OK' : 'Memory pressure high',
    };
  }

  /**
   * Shutdown – clean up intervals and flush (if needed)
   */
  async shutdown() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._emit('cache:shutdown', { timestamp: Date.now() });
    // If Redis, close connection
    if (this.redis) {
      await this.redis.quit();
    }
  }

  // ─── Batch Operations ───────────────────────────────────────────

  /**
   * Set multiple values in a namespace
   */
  async setMany(ns, entries, ttl = this.defaultTTL) {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(ns, key, value, ttl);
    }
  }

  /**
   * Get multiple values from a namespace
   */
  async getMany(ns, keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(ns, key);
    }
    return results;
  }

  /**
   * Delete multiple keys from a namespace
   */
  async deleteMany(ns, keys) {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(ns, key)) count++;
    }
    return count;
  }

  // ─── Event Subscription ─────────────────────────────────────────

  /**
   * Subscribe to cache events
   * @param {string} event - event name (e.g., 'cache:set')
   * @param {Function} listener
   */
  on(event, listener) {
    if (this.eventBus) {
      this.eventBus.on(event, listener);
    } else {
      // Fallback: use local EventEmitter
      if (!this._ee) this._ee = new EventEmitter();
      this._ee.on(event, listener);
    }
  }

  // ─── Debug / Inspection ────────────────────────────────────────

  /**
   * Get all keys in a namespace (for debugging)
   */
  inspect(ns) {
    const store = this.namespaces.get(ns);
    if (!store) return [];
    return Array.from(store.keys());
  }

  /**
   * Get all entries in a namespace (for debugging)
   */
  dump(ns) {
    const store = this.namespaces.get(ns);
    if (!store) return {};
    const result = {};
    for (const [key, entry] of store) {
      result[key] = entry.value;
    }
    return result;
  }
}

module.exports = CacheManager;