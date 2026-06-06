/**
 * EventBus v5.0
 * 
 * Features:
 * - Wildcard events (e.g., 'user.*' matches 'user.login', 'user.logout')
 * - Priority-based listener ordering
 * - Once listeners (auto-remove after one fire)
 * - Error isolation (errors don't break other listeners)
 * - Listener counts and statistics
 * - Async support (waits for all listeners to resolve)
 */

class EventBus {
  constructor() {
    this.listeners = new Map();      // event name -> ListenerItem[]
    this.wildcardCache = new Map();  // event name -> list of wildcard patterns that match
    this.stats = {
      totalEventsEmitted: 0,
      totalListenersCalled: 0,
      totalErrors: 0,
    };
  }

  /**
   * Internal: Add a listener to a specific event (no wildcard expansion)
   * @private
   */
  _addListener(event, listener, priority = 0, once = false) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const list = this.listeners.get(event);
    const item = { listener, priority, once };
    // Insert sorted by priority (higher priority first)
    const index = list.findIndex(existing => existing.priority < priority);
    if (index === -1) list.push(item);
    else list.splice(index, 0, item);
    // Invalidate wildcard cache because new listener affects matching
    this.wildcardCache.clear();
    return this;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports wildcards like 'user.*' or '*.ready')
   * @param {Function} listener - Async function (eventData) => void
   * @param {number} priority - Higher priority = called first (default 0)
   * @returns {Function} Unsubscribe function
   */
  on(event, listener, priority = 0) {
    this._addListener(event, listener, priority, false);
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to an event once
   * @param {string} event - Event name
   * @param {Function} listener - Async function
   * @param {number} priority - Higher priority = called first
   * @returns {Function} Unsubscribe function
   */
  once(event, listener, priority = 0) {
    this._addListener(event, listener, priority, true);
    return () => this.off(event, listener);
  }

  /**
   * Remove a specific listener from an event
   * @param {string} event - Event name
   * @param {Function} listener - The listener function to remove
   */
  off(event, listener) {
    const list = this.listeners.get(event);
    if (!list) return;
    const index = list.findIndex(item => item.listener === listener);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) this.listeners.delete(event);
    this.wildcardCache.clear();
  }

  /**
   * Remove all listeners for an event (or all if no event given)
   * @param {string} [event] - Optional event name
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
      this.wildcardCache.clear();
    } else {
      this.listeners.clear();
      this.wildcardCache.clear();
    }
  }

  /**
   * Internal: Collect all listeners that match an event (including wildcards)
   * @private
   */
  _getMatchingListeners(event) {
    const direct = this.listeners.get(event) || [];
    // Use cache for wildcard matches
    if (this.wildcardCache.has(event)) {
      const wildcardIndices = this.wildcardCache.get(event);
      const wildcardListeners = [];
      for (const pattern of wildcardIndices) {
        const patternListeners = this.listeners.get(pattern);
        if (patternListeners) wildcardListeners.push(...patternListeners);
      }
      return [...direct, ...wildcardListeners];
    }
    // Compute wildcard matches
    const wildcardPatterns = Array.from(this.listeners.keys()).filter(pattern => this._matchesWildcard(pattern, event));
    this.wildcardCache.set(event, wildcardPatterns);
    const wildcardListeners = [];
    for (const pattern of wildcardPatterns) {
      const list = this.listeners.get(pattern);
      if (list) wildcardListeners.push(...list);
    }
    return [...direct, ...wildcardListeners];
  }

  /**
   * Check if a pattern matches an event name (supports * and **)
   * @private
   */
  _matchesWildcard(pattern, event) {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      const base = pattern.slice(0, -2);
      return event === base || event.startsWith(base + '.');
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(event);
    }
    return false;
  }

  /**
   * Emit an event, calling all matching listeners (async, parallel)
   * @param {string} event - Event name
   * @param {any} data - Event payload
   * @returns {Promise<void>} Resolves when all listeners have executed
   */
  async emit(event, data) {
    this.stats.totalEventsEmitted++;
    const listeners = this._getMatchingListeners(event);
    if (listeners.length === 0) return;

    // Sort again by priority (already sorted per event, but merging two lists may break order)
    listeners.sort((a, b) => b.priority - a.priority);
    const promises = [];
    const toRemove = [];

    for (const item of listeners) {
      this.stats.totalListenersCalled++;
      try {
        await item.listener(data);
      } catch (err) {
        this.stats.totalErrors++;
        console.error(`EventBus error in listener for "${event}":`, err);
        // Optionally emit an error event
        this.emit('eventbus.error', { event, error: err.message, listener: item.listener.name });
      }
      if (item.once) toRemove.push(item);
    }
    // Remove once listeners
    for (const item of toRemove) {
      const eventKey = this._findEventKeyForListener(item.listener);
      if (eventKey) this.off(eventKey, item.listener);
    }
  }

  /**
   * Helper: Find which event this listener belongs to (for removal)
   * @private
   */
  _findEventKeyForListener(listenerFn) {
    for (const [event, list] of this.listeners.entries()) {
      if (list.some(item => item.listener === listenerFn)) return event;
    }
    return null;
  }

  /**
   * Get the number of listeners for an event (or total if no event)
   * @param {string} [event] - Optional event name
   * @returns {number}
   */
  listenerCount(event) {
    if (event) {
      return (this.listeners.get(event) || []).length;
    }
    let total = 0;
    for (const list of this.listeners.values()) total += list.length;
    return total;
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats, totalListeners: this.listenerCount() };
  }

  /**
   * Reset statistics (events emitted, listeners called, errors)
   */
  resetStats() {
    this.stats = {
      totalEventsEmitted: 0,
      totalListenersCalled: 0,
      totalErrors: 0,
    };
  }
}

module.exports = { EventBus };