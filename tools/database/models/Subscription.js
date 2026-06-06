/**
 * 👑 Subscription Model (v5.0)
 * Manages VIP/premium subscriptions
 */
const BaseModel = require('./base');

class SubscriptionModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
  }

  // 📝 Create or update subscription
  async set(userId, guildId, tier, expiresAt, autoRenew = 0) {
    await this.db.run(
      `INSERT OR REPLACE INTO subscriptions (userId, guildId, tier, expiresAt, autoRenew)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, guildId, tier, expiresAt, autoRenew]
    );
    this._emit('subscription.updated', { userId, guildId, tier, expiresAt });
  }

  // 🔍 Get subscription
  async get(userId, guildId) {
    return await this.db.get(
      `SELECT tier, expiresAt, autoRenew FROM subscriptions
       WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
  }

  // ❌ Delete subscription
  async delete(userId, guildId) {
    await this.db.run(
      `DELETE FROM subscriptions WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    this._emit('subscription.deleted', { userId, guildId });
  }

  // ⏰ Get all expired subscriptions
  async getExpired(now = Date.now()) {
    return await this.db.all(
      `SELECT userId, guildId, tier FROM subscriptions WHERE expiresAt <= ?`,
      [now]
    );
  }

  // 📋 Get active subscriptions for a guild
  async getActiveByGuild(guildId) {
    const now = Date.now();
    return await this.db.all(
      `SELECT userId, tier, expiresAt FROM subscriptions
       WHERE guildId = ? AND expiresAt > ?`,
      [guildId, now]
    );
  }
}

module.exports = SubscriptionModel;