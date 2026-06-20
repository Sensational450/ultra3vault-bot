/**
 * 💤 Inactivity Check Job
 * - DMs users inactive for 7+ days with a welcome-back reward
 * - Runs every Sunday at 10 AM UTC
 */
module.exports = ({ eventBus, logger, models, client, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('GrowthRetentionAgent');
    if (!agent) {
      logger.warn('⚠️ GrowthRetentionAgent not found for inactivityCheck job');
      return;
    }
    await agent._nudgeInactiveUsers();
  };
};