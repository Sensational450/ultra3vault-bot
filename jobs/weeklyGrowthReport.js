/**
 * 📊 Weekly Growth Report Job
 * - Posts total members, new members, and top chatters to #announcements
 * - Runs every Monday at 9 AM UTC
 */
module.exports = ({ eventBus, logger, models, client, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('GrowthRetentionAgent');
    if (!agent) {
      logger.warn('⚠️ GrowthRetentionAgent not found for weeklyGrowthReport job');
      return;
    }
    await agent._generateWeeklyReport();
  };
};