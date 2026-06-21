/**
 * 💾 Memory Monitor Job
 * - Checks memory usage and triggers cleanup if >80%
 * - Runs every 10 minutes
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for memoryMonitor job');
      return;
    }
    await agent._memoryMonitor();
  };
};