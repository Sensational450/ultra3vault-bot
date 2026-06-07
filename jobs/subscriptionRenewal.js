/**
 * 👑 SubscriptionRenewal Job v5.0
 * - Checks for expired VIP subscriptions
 * - Revokes roles, updates database, notifies users
 * - Emits events for vipAgent to process additional logic
 * - Designed to be scheduled by core/scheduler.js (e.g., every hour)
 */
module.exports = (options = {}) => {
  const { eventBus, logger, models, client, autoRenewEnabled = false, gracePeriodMs = 86400000 } = options;

  return async () => {
    logger?.info('👑 Running subscription renewal job...');
    try {
      if (!models?.Subscription) {
        logger?.warn('⚠️ Subscription model not available, skipping');
        return;
      }

      const now = Date.now();
      const expiredSubs = await models.Subscription.getExpired(now);

      if (expiredSubs.length === 0) {
        logger?.debug('✅ No expired subscriptions found');
        return;
      }

      const results = { revoked: [], autoRenewed: [], failed: [] };

      for (const sub of expiredSubs) {
        const { userId, guildId, tier } = sub;

        // Attempt auto‑renewal if enabled and method exists (placeholder)
        if (autoRenewEnabled && typeof models.Subscription.attemptAutoRenew === 'function') {
          const renewed = await models.Subscription.attemptAutoRenew(userId, guildId, tier);
          if (renewed) {
            results.autoRenewed.push({ userId, guildId, tier });
            continue;
          }
        }

        // Revoke role and delete subscription
        const guild = client?.guilds?.cache?.get(guildId);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            // Get role ID from tier (you must have a mapping – e.g., from VipAgent tiers)
            const roleId = process.env[`${tier.toUpperCase()}_ROLE_ID`];
            if (roleId && member.roles.cache.has(roleId)) {
              await member.roles.remove(roleId).catch(err => logger?.error(`Failed to remove role: ${err.message}`));
            }
          }
        }

        await models.Subscription.delete(userId, guildId);
        results.revoked.push({ userId, guildId, tier });

        // DM notification
        const user = await client?.users?.fetch(userId).catch(() => null);
        if (user) {
          user.send(`⚠️ Your **${tier}** subscription has expired. Use \`/subscribe\` to renew.`).catch(() => {});
        }
      }

      eventBus?.emit('subscription.renewal.complete', { timestamp: Date.now(), results });
      logger?.info(`✅ Subscription renewal completed: revoked=${results.revoked.length}, autoRenewed=${results.autoRenewed.length}, failed=${results.failed.length}`);
    } catch (err) {
      logger?.error(`❌ Subscription renewal job failed: ${err.message}`);
      eventBus?.emit('subscription.renewal.error', { error: err.message });
    }
  };
};