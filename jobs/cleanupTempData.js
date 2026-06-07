/**
 * 🧹 CleanupTempData Job v5.0
 * - Removes expired cache entries (from memory/cache.js)
 * - Cleans up old temporary database records (e.g., temp tokens, pending actions)
 * - Optionally clears stale user memory (userMemory.js) or conversation history
 * - Emits events for logging/monitoring
 * - Designed to be scheduled by core/scheduler.js (e.g., every few hours)
 */
module.exports = (options = {}) => {
  const { eventBus, logger, cache, userMemory, conversationMemory, db, cleanupAgeMs = 3600000 } = options;

  return async () => {
    logger?.info('🧹 Running temporary data cleanup job...');
    const results = {
      cacheExpired: 0,
      userMemoryExpired: 0,
      conversationExpired: 0,
      dbTempRows: 0,
    };

    try {
      // 1️⃣ Clean expired cache entries (if cache has a cleanExpired method)
      if (cache && typeof cache.cleanExpired === 'function') {
        const before = cache.stats?.().size ?? 0;
        await cache.cleanExpired();
        const after = cache.stats?.().size ?? 0;
        results.cacheExpired = Math.max(0, before - after);
        logger?.debug(`🗑️ Cache cleaned: removed ${results.cacheExpired} expired entries`);
      }

      // 2️⃣ Clean expired user memory (if userMemory has cleanExpired)
      if (userMemory && typeof userMemory.cleanExpired === 'function') {
        const before = userMemory.stats?.().size ?? 0;
        await userMemory.cleanExpired();
        const after = userMemory.stats?.().size ?? 0;
        results.userMemoryExpired = Math.max(0, before - after);
        logger?.debug(`🧠 UserMemory cleaned: removed ${results.userMemoryExpired} expired entries`);
      }

      // 3️⃣ Clean old conversation history (by age)
      if (conversationMemory && typeof conversationMemory.cleanOld === 'function') {
        const cutoff = Date.now() - cleanupAgeMs;
        results.conversationExpired = await conversationMemory.cleanOld(cutoff);
        logger?.debug(`💬 Conversation cache cleaned: removed ${results.conversationExpired} old messages`);
      }

      // 4️⃣ Clean temporary rows in database (example tables)
      if (db) {
        // Example: delete rows from a `temp_sessions` table older than X hours
        const cutoff = Date.now() - cleanupAgeMs;
        if (db.run) {
          try {
            const sessResult = await db.run(`DELETE FROM temp_sessions WHERE expires_at < ?`, [cutoff]);
            results.dbTempRows += sessResult.changes || 0;
          } catch (err) { /* table might not exist – ignore */ }
          try {
            const tokenResult = await db.run(`DELETE FROM verification_tokens WHERE expires_at < ?`, [cutoff]);
            results.dbTempRows += tokenResult.changes || 0;
          } catch (err) { /* ignore */ }
        }
        logger?.debug(`🗄️ Database cleaned: removed ${results.dbTempRows} temporary rows`);
      }

      eventBus?.emit('cleanup.complete', {
        timestamp: Date.now(),
        results,
      });
      logger?.info(`✅ Cleanup completed: removed ${results.cacheExpired} cache, ${results.userMemoryExpired} user entries, ${results.dbTempRows} DB rows`);
    } catch (err) {
      logger?.error(`❌ Cleanup job failed: ${err.message}`);
      eventBus?.emit('cleanup.error', { error: err.message });
    }
  };
};