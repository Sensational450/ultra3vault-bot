/**
 * 📡 EventBus v5.0
 * - Wildcard events ('user.*', 'payment.*.success')
 * - Priority listeners (higher priority runs first)
 * - Once listeners (auto‑remove after one fire)
 * - Error isolation – one listener error doesn't stop others
 * - Optional logger integration (for errors and debug)
 * - Listener statistics
 * - Helper to inspect listeners
 */

class EventBus {
  constructor(options = {}) {
    this.listeners = new Map();      // eventName -> ListenerItem[]
    this.wildcardCache = new Map();  // eventName -> wildcard patterns that match
    this.logger = options.logger || console;
    this.stats = {
      totalEventsEmitted: 0,
      totalListenersCalled: 0,
      totalErrors: 0,
    };
  }

  // ---------- Internal Helpers ----------
  _addListener(event, listener, priority = 0, once = false) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event);
    const item = { listener, priority, once };
    const index = list.findIndex(existing => existing.priority < priority);
    if (index === -1) list.push(item);
    else list.splice(index, 0, item);
    this.wildcardCache.clear(); // invalidate wildcard cache
  }

  _matchesWildcard(pattern, event) {
    // Exact match
    if (pattern === '*') return true;
    // Pattern ending with .* matches exact base or any deeper
    if (pattern.endsWith('.*')) {
      const base = pattern.slice(0, -2);
      return event === base || event.startsWith(base + '.');
    }
    // General * wildcard (convert to regex)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(event);
    }
    return false;
  }

  _getMatchingListeners(event) {
    const direct = this.listeners.get(event) || [];
    if (this.wildcardCache.has(event)) {
      const patterns = this.wildcardCache.get(event);
      const wildcard = [];
      for (const p of patterns) {
        const l = this.listeners.get(p);
        if (l) wildcard.push(...l);
      }
      return [...direct, ...wildcard];
    }
    const patterns = Array.from(this.listeners.keys()).filter(pattern => this._matchesWildcard(pattern, event));
    this.wildcardCache.set(event, patterns);
    const wildcard = [];
    for (const p of patterns) {
      const l = this.listeners.get(p);
      if (l) wildcard.push(...l);
    }
    return [...direct, ...wildcard];
  }

  _findEventKeyForListener(listenerFn) {
    for (const [ev, list] of this.listeners.entries()) {
      if (list.some(item => item.listener === listenerFn)) return ev;
    }
    return null;
  }

  // ---------- Public API ----------
  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports wildcards)
   * @param {Function} listener - Async function (data) => void
   * @param {number} priority - Higher = called first (default 0)
   * @returns {Function} Unsubscribe function
   */
  on(event, listener, priority = 0) {
    this._addListener(event, listener, priority, false);
    return () => this.off(event, listener);
  }

  /**
   * Subscribe once (auto‑removed after first call)
   */
  once(event, listener, priority = 0) {
    this._addListener(event, listener, priority, true);
    return () => this.off(event, listener);
  }

  /**
   * Remove a specific listener from an event
   */
  off(event, listener) {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex(item => item.listener === listener);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.listeners.delete(event);
    this.wildcardCache.clear();
  }

  /**
   * Remove all listeners (optionally for a specific event)
   */
  removeAllListeners(event) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    this.wildcardCache.clear();
  }

  /**
   * Emit an event – all matching listeners run in parallel (async)
   * @param {string} event - Event name
   * @param {any} data - Event payload
   */
  async emit(event, data) {
    this.stats.totalEventsEmitted++;
    const listeners = this._getMatchingListeners(event);
    if (listeners.length === 0) return;

    // Sort by priority (higher first)
    listeners.sort((a, b) => b.priority - a.priority);
    const toRemove = [];

    for (const item of listeners) {
      this.stats.totalListenersCalled++;
      try {
        await item.listener(data);
      } catch (err) {
        this.stats.totalErrors++;
        this.logger.error(`📡 EventBus error in "${event}":`, err);
        this.emit('eventbus.error', { event, error: err.message, stack: err.stack });
      }
      if (item.once) toRemove.push(item);
    }

    for (const item of toRemove) {
      const eventKey = this._findEventKeyForListener(item.listener);
      if (eventKey) this.off(eventKey, item.listener);
    }
  }

  /**
   * Get number of listeners for an event (or total)
   */
  listenerCount(event) {
    if (event) return (this.listeners.get(event) || []).length;
    let total = 0;
    for (const list of this.listeners.values()) total += list.length;
    return total;
  }

  /**
   * Get detailed stats
   */
  getStats() {
    return {
      ...this.stats,
      totalListeners: this.listenerCount(),
      eventCount: this.listeners.size,
    };
  }

  /**
   * Inspect registered listeners (for debugging)
   * @returns {Object} Map of event names to listener counts and priorities
   */
  inspect() {
    const result = {};
    for (const [event, list] of this.listeners.entries()) {
      result[event] = list.map(item => ({
        priority: item.priority,
        once: item.once,
      }));
    }
    return result;
  }
}

module.exports = { EventBus };