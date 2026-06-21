/**
 * 🔍 Health Check Job
 * - Checks all agents and restarts unhealthy ones
 * - Runs every 15 minutes
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for healthCheck job');
      return;
    }
    await agent._healthCheck();
  };
};