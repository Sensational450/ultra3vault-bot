/**
 * 👑 Subscription Model (v6.0) – B2B Webhook Support
 * Manages VIP/premium subscriptions + webhook data feed for Agent-as-a-Service
 */
const BaseModel = require('./base');

class SubscriptionModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
  }

  // ──────────────────────────────────────────────
  // 📝 Create or update subscription (with webhook fields)
  // ──────────────────────────────────────────────

  async set(userId, guildId, tier, expiresAt, autoRenew = 0, options = {}) {
    const {
      agentAccess = ['moderation'],
      webhookUrl = null,
      webhookStatus = 'active',
      webhookLastError = null,
      webhookLastSuccess = null,
      webhookFailureCount = 0,
    } = options;

    const agentAccessJson = JSON.stringify(agentAccess);

    await this.db.run(
      `INSERT OR REPLACE INTO subscriptions 
       (userId, guildId, tier, expiresAt, autoRenew, agentAccess, 
        webhook_url, webhook_status, webhook_last_error, webhook_last_success, webhook_failure_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        guildId,
        tier,
        expiresAt,
        autoRenew,
        agentAccessJson,
        webhookUrl,
        webhookStatus,
        webhookLastError,
        webhookLastSuccess,
        webhookFailureCount,
      ]
    );
    this._emit('subscription.updated', { userId, guildId, tier, expiresAt, webhookUrl });
  }

  // ──────────────────────────────────────────────
  // 🔍 Get subscription (by userId + guildId)
  // ──────────────────────────────────────────────

  async get(userId, guildId) {
    const row = await this.db.get(
      `SELECT tier, expiresAt, autoRenew, agentAccess, 
              webhook_url, webhook_status, webhook_last_error, 
              webhook_last_success, webhook_failure_count
       FROM subscriptions
       WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    if (!row) return null;
    return this._parseRow(row);
  }

  // ──────────────────────────────────────────────
  // 🔍 Get subscription by guildId only (for webhook lookup)
  // ──────────────────────────────────────────────

  async getByGuild(guildId) {
    const row = await this.db.get(
      `SELECT userId, tier, expiresAt, autoRenew, agentAccess,
              webhook_url, webhook_status, webhook_last_error,
              webhook_last_success, webhook_failure_count
       FROM subscriptions
       WHERE guildId = ?
       ORDER BY expiresAt DESC
       LIMIT 1`,
      [guildId]
    );
    if (!row) return null;
    return this._parseRow(row);
  }

  // ──────────────────────────────────────────────
  // 🔍 Get active subscription for a guild (with webhook)
  // ──────────────────────────────────────────────

  async getActiveWebhookSubscription(guildId) {
    const now = Date.now();
    const row = await this.db.get(
      `SELECT userId, tier, expiresAt, autoRenew, agentAccess,
              webhook_url, webhook_status, webhook_last_error,
              webhook_last_success, webhook_failure_count
       FROM subscriptions
       WHERE guildId = ? 
         AND expiresAt > ?
         AND webhook_url IS NOT NULL
         AND webhook_status = 'active'
       ORDER BY expiresAt DESC
       LIMIT 1`,
      [guildId, now]
    );
    if (!row) return null;
    return this._parseRow(row);
  }

  // ──────────────────────────────────────────────
  // 🔄 Renew subscription (add days to existing expiry)
  // ──────────────────────────────────────────────

  async renew(userId, guildId, additionalDays) {
    const current = await this.get(userId, guildId);
    if (!current) return null;
    const newExpiry = current.expiresAt > Date.now()
      ? current.expiresAt + additionalDays * 86400000
      : Date.now() + additionalDays * 86400000;
    await this.set(userId, guildId, current.tier, newExpiry, current.autoRenew, {
      agentAccess: current.agentAccess,
      webhookUrl: current.webhookUrl,
      webhookStatus: current.webhookStatus,
      webhookLastSuccess: current.webhookLastSuccess,
      webhookFailureCount: current.webhookFailureCount,
    });
    this._emit('subscription.renewed', { userId, guildId, newExpiry });
    return newExpiry;
  }

  // ──────────────────────────────────────────────
  // ❌ Delete subscription
  // ──────────────────────────────────────────────

  async delete(userId, guildId) {
    await this.db.run(
      `DELETE FROM subscriptions WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    this._emit('subscription.deleted', { userId, guildId });
  }

  // ──────────────────────────────────────────────
  // ⏰ Get all expired subscriptions
  // ──────────────────────────────────────────────

  async getExpired(now = Date.now()) {
    const rows = await this.db.all(
      `SELECT userId, guildId, tier, webhook_url FROM subscriptions WHERE expiresAt <= ?`,
      [now]
    );
    return rows.map(row => this._parseRow(row));
  }

  // ──────────────────────────────────────────────
  // 📋 Get active subscriptions for a guild (list of users)
  // ──────────────────────────────────────────────

  async getActiveByGuild(guildId) {
    const now = Date.now();
    const rows = await this.db.all(
      `SELECT userId, tier, expiresAt, webhook_url FROM subscriptions
       WHERE guildId = ? AND expiresAt > ?`,
      [guildId, now]
    );
    return rows.map(row => this._parseRow(row));
  }

  // ──────────────────────────────────────────────
  // 🛠️ Webhook management helpers
  // ──────────────────────────────────────────────

  async updateWebhook(userId, guildId, webhookUrl) {
    await this.db.run(
      `UPDATE subscriptions 
       SET webhook_url = ?, webhook_status = 'active', webhook_failure_count = 0, webhook_last_error = NULL
       WHERE userId = ? AND guildId = ?`,
      [webhookUrl, userId, guildId]
    );
    this._emit('webhook.updated', { userId, guildId, webhookUrl });
  }

  async incrementWebhookFailure(userId, guildId, errorMessage) {
    await this.db.run(
      `UPDATE subscriptions 
       SET webhook_failure_count = webhook_failure_count + 1,
           webhook_last_error = ?,
           webhook_status = CASE WHEN webhook_failure_count + 1 >= 5 THEN 'error' ELSE webhook_status END
       WHERE userId = ? AND guildId = ?`,
      [errorMessage, userId, guildId]
    );
  }

  async resetWebhookFailure(userId, guildId) {
    await this.db.run(
      `UPDATE subscriptions 
       SET webhook_failure_count = 0,
           webhook_status = 'active',
           webhook_last_error = NULL,
           webhook_last_success = ?
       WHERE userId = ? AND guildId = ?`,
      [Date.now(), userId, guildId]
    );
  }

  // ──────────────────────────────────────────────
  // 📦 Agent access control
  // ──────────────────────────────────────────────

  async setAgentAccess(userId, guildId, agentAccessArray) {
    const json = JSON.stringify(agentAccessArray);
    await this.db.run(
      `UPDATE subscriptions SET agentAccess = ? WHERE userId = ? AND guildId = ?`,
      [json, userId, guildId]
    );
  }

  async isAgentEnabled(userId, guildId, agentName) {
    const sub = await this.get(userId, guildId);
    if (!sub) return false;
    return sub.agentAccess && sub.agentAccess.includes(agentName);
  }

  // ──────────────────────────────────────────────
  // 🧹 Internal: parse row from DB
  // ──────────────────────────────────────────────

  _parseRow(row) {
    if (!row) return null;
    return {
      userId: row.userId,
      guildId: row.guildId,
      tier: row.tier,
      expiresAt: row.expiresAt,
      autoRenew: row.autoRenew,
      agentAccess: row.agentAccess ? JSON.parse(row.agentAccess) : ['moderation'],
      webhookUrl: row.webhook_url,
      webhookStatus: row.webhook_status,
      webhookLastError: row.webhook_last_error,
      webhookLastSuccess: row.webhook_last_success,
      webhookFailureCount: row.webhook_failure_count || 0,
      // convenience
      hasWebhook: !!row.webhook_url && row.webhook_status === 'active',
      isActive: row.expiresAt > Date.now(),
      isExpired: row.expiresAt <= Date.now(),
    };
  }
}

module.exports = SubscriptionModel;