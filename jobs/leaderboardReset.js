/**
 * 🏆 LeaderboardReset Job v5.0
 * - Resets weekly leaderboard data (economy, referrals, XP)
 * - Emits 'leaderboard.reset' event for agents
 * - Designed to be scheduled by core/scheduler.js (e.g., weekly)
 */
module.exports = (options = {}) => {
  const { eventBus, logger, models } = options;

  return async () => {
    logger?.info('🏆 Running leaderboard reset job...');

    try {
      const results = {};

      // 1️⃣ Reset economy weekly stats if method exists
      if (models?.Economy?.resetWeekly) {
        await models.Economy.resetWeekly();
        results.economy = 'reset';
        logger?.info('💰 Economy weekly leaderboard reset');
      } else if (models?.Economy) {
        logger?.debug('ℹ️ Economy.resetWeekly not implemented – skipping');
      }

      // 2️⃣ Reset referral weekly stats if method exists
      if (models?.Referral?.resetWeekly) {
        await models.Referral.resetWeekly();
        results.referral = 'reset';
        logger?.info('🔗 Referral weekly leaderboard reset');
      } else if (models?.Referral) {
        logger?.debug('ℹ️ Referral.resetWeekly not implemented – skipping');
      }

      // 3️⃣ Emit generic event for any agent that wants to react
      eventBus?.emit('leaderboard.reset', {
        timestamp: Date.now(),
        results,
      });

      logger?.info('✅ Leaderboard reset completed', results);
    } catch (err) {
      logger?.error(`❌ Leaderboard reset failed: ${err.message}`);
      eventBus?.emit('leaderboard.error', { error: err.message });
    }
  };
};