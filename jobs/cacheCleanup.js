/**
 * 🧹 Cache Cleanup Job (v5.0)
 * - Uses the shared CacheManager instance from index.js
 * - Performs cleanup on demand (normal or aggressive)
 * - Can generate reports, clear specific caches, or return stats
 * - Designed to be scheduled by core/scheduler.js
 */
module.exports = ({ eventBus, logger, orchestrator, cacheManager }) => {
  return async function execute(options = {}) {
    if (!cacheManager) {
      logger.warn('⚠️ CacheManager not provided to cacheCleanup job');
      return;
    }

    // Handle commands
    if (options.command === 'report') {
      await cacheManager.generateReport();
      return;
    }
    if (options.command === 'clear' && options.cache) {
      await cacheManager.clearCache(options.cache);
      return;
    }
    if (options.command === 'stats') {
      return cacheManager.getStats();
    }

    // Perform cleanup
    const aggressive = options.aggressive || false;
    logger.debug(`🧹 cacheCleanup job running (aggressive: ${aggressive})`);

    // The CacheManager will handle its own caches and also call agent cleanup methods
    await cacheManager.performCleanup({ aggressive });

    // Optionally emit event
    eventBus?.emit('cacheCleanup.job.complete', {
      aggressive,
      timestamp: Date.now(),
      stats: cacheManager.getStats(),
    });
  };
};