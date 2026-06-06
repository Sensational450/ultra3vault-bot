/**
 * 👑 SubscriptionRenewal Job v5.0
 * - Checks for expired VIP subscriptions (daily or hourly)
 * - Revokes roles, updates database, notifies users
 * - Handles auto‑renewal (optional, based on payment settings)
 * - Emits events for vipAgent to process additional logic
 * - Designed to be scheduled by core/scheduler.js (e.g., every hour)
 */
class SubscriptionRenewal {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.models = options.models;               // Database models (Subscription, User)
    this.client = options.client;               // Discord client for role management
    this.autoRenewEnabled = options.autoRenewEnabled || false; // Attempt auto‑renewal?
    this.gracePeriodMs = options.gracePeriodMs || 86400000;    // 24 hours grace period
    this.checkIntervalMs = options.checkIntervalMs || 3600000; // For internal scheduling
  }

  /**
   * 🚀 Main job execution – called by scheduler
   */
  async run() {
    this.logger.info('👑 Running subscription renewal job...');
    try {
      const expiredSubs = await this.getExpiredSubscriptions();
      if (expiredSubs.length === 0) {
        this.logger.debug('✅ No expired subscriptions found');
        return;
      }

      const results = {
        revoked: [],
        autoRenewed: [],
        failed: [],
      };

      for (const sub of expiredSubs) {
        await this.processExpiredSubscription(sub, results);
      }

      // 📡 Emit event so vipAgent can perform additional actions (e.g., log, DM users)
      this.eventBus?.emit('subscription.renewal.complete', {
        timestamp: Date.now(),
        results,
      });

      this.logger.info(`✅ Subscription renewal completed: revoked=${results.revoked.length}, autoRenewed=${results.autoRenewed.length}, failed=${results.failed.length}`);
    } catch (err) {
      this.logger.error(`❌ Subscription renewal job failed: ${err.message}`);
      this.eventBus?.emit('subscription.renewal.error', { error: err.message });
    }
  }

  /**
   * 🔍 Get all expired subscriptions that haven't been processed
   * - Checks both exact expiry and grace period
   */
  async getExpiredSubscriptions() {
    if (!this.models?.Subscription) {
      this.logger.warn('⚠️ Subscription model not available, skipping');
      return [];
    }

    const now = Date.now();
    const expiryThreshold = now - this.gracePeriodMs; // Subscriptions beyond grace period are definitely expired
    try {
      // This method should exist in your Subscription model
      const expired = await this.models.Subscription.getExpired(now);
      // Filter those that are beyond grace period (or already handled)
      return expired.filter(sub => sub.expiresAt <= expiryThreshold);
    } catch (err) {
      this.logger.error(`Error fetching expired subscriptions: ${err.message}`);
      return [];
    }
  }

  /**
   * ⚙️ Process a single expired subscription
   */
  async processExpiredSubscription(subscription, results) {
    const { userId, guildId, tier, autoRenew } = subscription;
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      this.logger.warn(`⚠️ Guild ${guildId} not found for user ${userId}`);
      results.failed.push({ userId, guildId, reason: 'Guild not found' });
      return;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      this.logger.warn(`⚠️ Member ${userId} not found in guild ${guildId}`);
      results.failed.push({ userId, guildId, reason: 'Member not found' });
      return;
    }

    // Attempt auto‑renewal if enabled and user has valid payment method
    if (this.autoRenewEnabled && autoRenew) {
      const renewed = await this.attemptAutoRenewal(subscription, member);
      if (renewed) {
        results.autoRenewed.push({ userId, guildId, tier });
        return;
      }
    }

    // Revoke role
    const roleId = this.getRoleIdForTier(tier);
    if (roleId && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(err => {
        this.logger.error(`Failed to remove role ${roleId} from ${userId}: ${err.message}`);
      });
    }

    // Delete subscription from database
    await this.models.Subscription.delete(userId, guildId);
    this.logger.info(`🔰 Revoked ${tier} subscription from ${userId} in guild ${guildId}`);

    // Notify user via DM
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (user) {
      user.send(`⚠️ Your **${tier}** subscription has expired. Renew at any time with \`/buy\`.`).catch(() => {});
    }

    results.revoked.push({ userId, guildId, tier });
    this.eventBus?.emit('subscription.revoked', { userId, guildId, tier });
  }

  /**
   * 🔄 Attempt to auto‑renew subscription (placeholder – integrate with your payment system)
   * @returns {Promise<boolean>}
   */
  async attemptAutoRenewal(subscription, member) {
    const { userId, guildId, tier } = subscription;
    this.logger.info(`🔄 Attempting auto‑renewal for ${userId} (${tier})`);
    // In a real implementation, you would:
    // 1. Check if user has a saved payment method
    // 2. Charge the payment method
    // 3. If successful, call models.Subscription.set() with new expiry date
    // 4. Optionally send a success DM
    // For now, return false (not implemented)
    return false;
  }

  /**
   * 🏷️ Get Discord role ID for a given tier (customize as needed)
   */
  getRoleIdForTier(tier) {
    const roleMap = {
      vip: process.env.VIP_ROLE_ID,
      premium: process.env.PREMIUM_ROLE_ID,
    };
    return roleMap[tier];
  }
}

// 📦 Factory function for scheduler integration
module.exports = (options = {}) => {
  const { eventBus, logger, models, client, autoRenewEnabled, gracePeriodMs } = options;
  const renewal = new SubscriptionRenewal({
    eventBus,
    logger,
    models,
    client,
    autoRenewEnabled,
    gracePeriodMs,
  });
  return async () => {
    await renewal.run();
  };
};