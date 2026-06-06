/**
 * EventBus v5.0
 * - Wildcard events ('user.*')
 * - Priority listeners
 * - Once listeners
 * - Error isolation
 * - Listener stats
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.wildcardCache = new Map();
    this.stats = {
      totalEventsEmitted: 0,
      totalListenersCalled: 0,
      totalErrors: 0,
    };
  }

  _addListener(event, listener, priority = 0, once = false) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event);
    const item = { listener, priority, once };
    const index = list.findIndex(existing => existing.priority < priority);
    if (index === -1) list.push(item);
    else list.splice(index, 0, item);
    this.wildcardCache.clear();
  }

  on(event, listener, priority = 0) {
    this._addListener(event, listener, priority, false);
    return () => this.off(event, listener);
  }

  once(event, listener, priority = 0) {
    this._addListener(event, listener, priority, true);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex(item => item.listener === listener);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.listeners.delete(event);
    this.wildcardCache.clear();
  }

  removeAllListeners(event) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    this.wildcardCache.clear();
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

  async emit(event, data) {
    this.stats.totalEventsEmitted++;
    const listeners = this._getMatchingListeners(event);
    if (listeners.length === 0) return;
    listeners.sort((a, b) => b.priority - a.priority);
    const toRemove = [];
    for (const item of listeners) {
      this.stats.totalListenersCalled++;
      try {
        await item.listener(data);
      } catch (err) {
        this.stats.totalErrors++;
        console.error(`EventBus error in "${event}":`, err);
        this.emit('eventbus.error', { event, error: err.message });
      }
      if (item.once) toRemove.push(item);
    }
    for (const item of toRemove) {
      const eventKey = this._findEventKeyForListener(item.listener);
      if (eventKey) this.off(eventKey, item.listener);
    }
  }

  _findEventKeyForListener(listenerFn) {
    for (const [ev, list] of this.listeners.entries()) {
      if (list.some(item => item.listener === listenerFn)) return ev;
    }
    return null;
  }

  listenerCount(event) {
    if (event) return (this.listeners.get(event) || []).length;
    let total = 0;
    for (const list of this.listeners.values()) total += list.length;
    return total;
  }

  getStats() {
    return { ...this.stats, totalListeners: this.listenerCount() };
  }
}

module.exports = { EventBus };