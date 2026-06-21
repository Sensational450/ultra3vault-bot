/**
 * 🧹 Cache Cleanup Job
 * - Clears old cache entries from all agents
 * - Runs every 30 minutes
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for cacheCleanup job');
      return;
    }
    await agent._cacheCleanup();
  };
};