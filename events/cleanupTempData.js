/**
 * 🧹 CleanupTempData Job v5.0
 * - Removes expired cache entries (from memory/cache.js)
 * - Cleans up old temporary database records (e.g., temp tokens, pending actions)
 * - Optionally clears stale user memory (userMemory.js) or conversation history
 * - Emits events for logging/monitoring
 * - Designed to be scheduled by core/scheduler.js (e.g., every hour)
 */
class CleanupTempData {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.cache = options.cache;                     // memory/cache.js instance
    this.userMemory = options.userMemory;           // memory/userMemory.js instance
    this.conversationMemory = options.conversationMemory; // memory/conversationMemory.js
    this.db = options.db;                           // database instance (optional)
    this.cleanupAgeMs = options.cleanupAgeMs || 3600000; // 1 hour default
  }

  /**
   * 🚀 Main job execution – called by scheduler
   */
  async run() {
    this.logger.info('🧹 Running temporary data cleanup job...');
    const results = {
      cacheExpired: 0,
      userMemoryExpired: 0,
      conversationExpired: 0,
      dbTempRows: 0,
    };

    try {
      // 🧩 1. Clean expired cache entries (if cache has a cleanExpired method)
      if (this.cache && typeof this.cache.cleanExpired === 'function') {
        const before = this.cache.stats().size;
        this.cache.cleanExpired();
        const after = this.cache.stats().size;
        results.cacheExpired = before - after;
        this.logger.debug(`🗑️ Cache cleaned: removed ${results.cacheExpired} expired entries`);
      } else if (this.cache && typeof this.cache.get === 'function') {
        // Fallback: iterate and remove expired if cache has TTL (not implemented in v5.0)
        this.logger.warn('⚠️ Cache instance does not support cleanExpired, skipping');
      }

      // 🧠 2. Clean expired user memory entries (if userMemory has cleanExpired)
      if (this.userMemory && typeof this.userMemory.cleanExpired === 'function') {
        const before = this.userMemory.stats().size;
        this.userMemory.cleanExpired();
        const after = this.userMemory.stats().size;
        results.userMemoryExpired = before - after;
        this.logger.debug(`🧠 UserMemory cleaned: removed ${results.userMemoryExpired} expired entries`);
      }

      // 💬 3. Clean old conversation history (by age)
      if (this.conversationMemory) {
        const cutoff = Date.now() - this.cleanupAgeMs;
        let removed = 0;
        // Assuming conversationMemory stores conversations with timestamps per message
        // We'll implement a cleanup based on conversation age or message age.
        // Here we'll just emit a warning that you need to implement it.
        this.logger.debug('💬 Conversation cleanup not fully implemented – add your own logic');
      }

      // 🗄️ 4. Clean temporary rows in database (e.g., pending actions, temp tokens)
      if (this.db) {
        const deleted = await this.cleanTempDbRows();
        results.dbTempRows = deleted;
      }

      // 📡 Emit completion event
      this.eventBus?.emit('cleanup.complete', {
        timestamp: Date.now(),
        results,
      });

      this.logger.info(`✅ Cleanup completed: removed ${results.cacheExpired} cache, ${results.userMemoryExpired} user entries, ${results.dbTempRows} DB rows`);
    } catch (err) {
      this.logger.error(`❌ Cleanup job failed: ${err.message}`);
      this.eventBus?.emit('cleanup.error', { error: err.message });
    }
  }

  /**
   * 🗄️ Clean temporary rows in database (example – customise to your schema)
   * @returns {Promise<number>} Number of deleted rows
   */
  async cleanTempDbRows() {
    if (!this.db) return 0;
    let total = 0;
    try {
      // Example: delete rows from a `temp_sessions` table older than X hours
      const cutoff = Date.now() - this.cleanupAgeMs;
      // Adjust the following to your actual table/column names
      const result = await this.db.run(`DELETE FROM temp_sessions WHERE expires_at < ?`, [cutoff]);
      total += result.changes || 0;
      // Delete old verification tokens
      const tokenResult = await this.db.run(`DELETE FROM verification_tokens WHERE expires_at < ?`, [cutoff]);
      total += tokenResult.changes || 0;
    } catch (err) {
      this.logger.error(`Error cleaning DB temp rows: ${err.message}`);
    }
    return total;
  }
}

// 📦 Factory function for scheduler integration
module.exports = (options = {}) => {
  const { eventBus, logger, cache, userMemory, conversationMemory, db, cleanupAgeMs } = options;
  const cleaner = new CleanupTempData({
    eventBus,
    logger,
    cache,
    userMemory,
    conversationMemory,
    db,
    cleanupAgeMs,
  });
  return async () => {
    await cleaner.run();
  };
};