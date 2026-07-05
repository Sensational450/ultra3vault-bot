/**
 * 🧹 Cache Cleanup Job (v2.0)
 * - Clears old cache entries from all agents that support cleanup
 * - Also triggers OptimizationAgent's internal cache cleanup
 * - Runs every 30 minutes
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    logger.debug('🧹 Running cache cleanup job...');

    // 1. First, call OptimizationAgent's internal cleanup if available
    const optAgent = orchestrator?.getAgent('OptimizationAgent');
    if (optAgent && typeof optAgent._cacheCleanup === 'function') {
      try {
        await optAgent._cacheCleanup();
        logger.debug('✅ OptimizationAgent cache cleanup complete');
      } catch (err) {
        logger.error(`❌ OptimizationAgent cache cleanup failed: ${err.message}`);
      }
    } else {
      logger.warn('⚠️ OptimizationAgent not found or _cacheCleanup missing');
    }

    // 2. Iterate over all agents and call their cleanup/clearCache methods
    const allAgents = orchestrator?.getAllAgents?.() || [];
    let cleaned = 0;
    let errors = 0;

    for (const agent of allAgents) {
      const name = agent.constructor?.name || 'UnknownAgent';
      // Skip OptimizationAgent (already handled)
      if (name === 'OptimizationAgent') continue;

      // Check for cleanup method
      const cleanupFn = agent.cleanup || agent.clearCache;
      if (typeof cleanupFn === 'function') {
        try {
          await cleanupFn.call(agent);
          cleaned++;
          logger.debug(`✅ ${name} cache cleaned`);
        } catch (err) {
          errors++;
          logger.error(`❌ ${name} cleanup failed: ${err.message}`);
        }
      }
    }

    // 3. Emit event for other listeners
    eventBus.emit('cache.cleanup', { cleaned, errors, timestamp: Date.now() });

    logger.info(`🧹 Cache cleanup completed (${cleaned} agents cleaned, ${errors} errors)`);
  };
};