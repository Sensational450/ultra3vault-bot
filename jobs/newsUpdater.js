/**
 * 📰 NewsUpdater Job v5.0
 * - Triggers the NewsAgent to fetch all news from RSS feeds
 * - Designed to be scheduled by core/scheduler.js (e.g., every 10 minutes)
 */
module.exports = (options = {}) => {
  const { eventBus, logger } = options;
  return async () => {
    logger?.debug('🔄 Running news updater job...');
    try {
      eventBus?.emit('job.newsUpdate');
      logger?.debug('✅ News updater completed');
    } catch (err) {
      logger?.error(`❌ News updater failed: ${err.message}`);
      eventBus?.emit('news.error', { error: err.message });
    }
  };
};