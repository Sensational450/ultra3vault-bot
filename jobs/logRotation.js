/**
 * 📦 Log Rotation Job
 * - Rotates and compresses log files > 10MB
 * - Runs daily at midnight
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('OptimizationAgent');
    if (!agent) {
      logger.warn('⚠️ OptimizationAgent not found for logRotation job');
      return;
    }
    await agent._logRotation();
  };
};