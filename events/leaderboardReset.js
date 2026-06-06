/**
 * 🏆 LeaderboardReset Job v5.0
 * - Resets weekly leaderboard data (e.g., economy, referrals, XP)
 * - Emits 'leaderboard.reset' event for agents (economyAgent, referralAgent)
 * - Can archive previous week's data before reset (optional)
 * - Designed to be scheduled by core/scheduler.js (e.g., every Sunday at midnight)
 */
class LeaderboardReset {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.models = options.models;           // Database models (Economy, Referral, etc.)
    this.cache = options.cache || null;     // Optional cache to invalidate
    this.archiveBeforeReset = options.archiveBeforeReset || false; // Store previous week
    this.resetTargets = options.resetTargets || ['economy']; // 'economy', 'referral', 'xp', etc.
  }

  /**
   * 🚀 Main job execution – called by scheduler
   */
  async run() {
    this.logger.info('🏆 Running leaderboard reset job...');
    try {
      const results = {};
      for (const target of this.resetTargets) {
        switch (target) {
          case 'economy':
            results.economy = await this.resetEconomyLeaderboard();
            break;
          case 'referral':
            results.referral = await this.resetReferralLeaderboard();
            break;
          case 'xp':
            results.xp = await this.resetXpLeaderboard();
            break;
          default:
            this.logger.warn(`⚠️ Unknown reset target: ${target}`);
        }
      }

      // 📡 Emit event so agents (e.g., economyAgent) can perform additional actions
      this.eventBus?.emit('leaderboard.reset', {
        timestamp: Date.now(),
        results,
      });

      this.logger.info(`✅ Leaderboard reset completed: ${JSON.stringify(results)}`);
    } catch (err) {
      this.logger.error(`❌ Leaderboard reset failed: ${err.message}`);
      this.eventBus?.emit('leaderboard.error', { error: err.message });
    }
  }

  /**
   * 💰 Reset economy leaderboard (e.g., weekly balance rankings)
   * - Archives current leaderboard if archiveBeforeReset is true
   * - Resets weekly stats (not total balances if you want permanent)
   */
  async resetEconomyLeaderboard() {
    if (!this.models?.Economy) {
      this.logger.warn('⚠️ Economy model not available, skipping');
      return { success: false, reason: 'No Economy model' };
    }

    // Example: archive current leaderboard to a separate table
    if (this.archiveBeforeReset) {
      await this.archiveLeaderboard('economy');
    }

    // Reset weekly stats – implement based on your schema
    // e.g., set 'weeklyEarnings' to 0, or copy current balances to 'lastWeekBalance'
    // This depends on your database design. Here's a generic approach:
    if (this.models.Economy.resetWeekly) {
      await this.models.Economy.resetWeekly();
    } else {
      this.logger.debug('💡 No reset method on Economy model – emitting event only');
    }

    // Invalidate cache if present
    if (this.cache) {
      this.cache.delete('leaderboard:weekly');
      this.logger.debug('🗑️ Cache invalidated for leaderboard:weekly');
    }

    return { success: true, target: 'economy' };
  }

  /**
   * 🔗 Reset referral leaderboard (weekly top referrers)
   */
  async resetReferralLeaderboard() {
    if (!this.models?.Referral) {
      this.logger.warn('⚠️ Referral model not available, skipping');
      return { success: false, reason: 'No Referral model' };
    }

    if (this.archiveBeforeReset) {
      await this.archiveLeaderboard('referral');
    }

    if (this.models.Referral.resetWeekly) {
      await this.models.Referral.resetWeekly();
    }

    if (this.cache) {
      this.cache.delete('leaderboard:referral');
    }

    return { success: true, target: 'referral' };
  }

  /**
   * 📈 Reset XP leaderboard (if you have leveling system)
   */
  async resetXpLeaderboard() {
    // Similar pattern
    return { success: true, target: 'xp', note: 'Not implemented yet' };
  }

  /**
   * 📦 Archive current leaderboard data (placeholder – customize)
   */
  async archiveLeaderboard(type) {
    // This could save the current leaderboard to a historical table
    this.logger.info(`📦 Archiving ${type} leaderboard...`);
    // Implement based on your DB schema
  }
}

// 📦 Factory function for scheduler integration
module.exports = (options = {}) => {
  const { eventBus, logger, models, cache, archiveBeforeReset, resetTargets } = options;
  const resetter = new LeaderboardReset({
    eventBus,
    logger,
    models,
    cache,
    archiveBeforeReset,
    resetTargets,
  });
  return async () => {
    await resetter.run();
  };
};