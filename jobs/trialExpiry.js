/**
 * ⏰ Trial Expiry Job
 * - Checks and expires trials every hour
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  return async function execute() {
    const vipAgent = orchestrator?.getAgent('VipAgent');
    if (!vipAgent) {
      logger.warn('⚠️ VipAgent not found for trialExpiry job');
      return;
    }
    const count = await vipAgent.expireTrials();
    if (count > 0) {
      logger.info(`⏰ Expired ${count} trials`);
    }
  };
};