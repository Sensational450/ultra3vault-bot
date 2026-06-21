module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('SelfImprovementAgent');
    if (!agent) { logger.warn('⚠️ SelfImprovementAgent not found'); return; }
    await agent._analyzePerformance();
  };
};