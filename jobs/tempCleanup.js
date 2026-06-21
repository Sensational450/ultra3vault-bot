/**
 * 🗑️ Temp Cleanup Job
 * - Deletes temporary files older than 7 days
 * - Runs weekly on Sunday
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for tempCleanup job');
      return;
    }
    await agent._tempCleanup();
  };
};