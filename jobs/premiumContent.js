module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('ContentPlanningAgent');
    if (!agent) { logger.warn('⚠️ ContentPlanningAgent not found for premiumContent job'); return; }
    await agent._postPremiumContent();
  };
};