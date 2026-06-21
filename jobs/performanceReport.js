/**
 * 📊 Performance Report Job
 * - Posts weekly performance report to #bot-logs
 * - Runs every Sunday at 8 PM UTC
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for performanceReport job');
      return;
    }
    await agent._generatePerformanceReport();
  };
};