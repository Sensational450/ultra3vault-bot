/**
 * 🎁 Daily Retention Job
 * - Gives a random active user a 3-day VIP trial
 * - Runs daily at 8 PM UTC
 */
module.exports = ({ eventBus, logger, models, client, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('GrowthRetentionAgent');
    if (!agent) {
      logger.warn('⚠️ GrowthRetentionAgent not found for dailyRetention job');
      return;
    }
    await agent._dailyRetentionCheck();
  };
};