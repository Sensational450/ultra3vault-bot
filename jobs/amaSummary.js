/**
 * 🎙️ AMA Summary Job
 * - Posts a weekly summary of AMA questions to #ama-chat
 * - Runs every Sunday at 8 PM UTC
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const agent = orchestrator?.getAgent('AMAAgent');
    if (!agent) {
      logger.warn('⚠️ AMAAgent not found for amaSummary job');
      return;
    }
    await agent._postAMASummary();
  };
};