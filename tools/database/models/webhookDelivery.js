// tools/database/models/WebhookDelivery.js
const { Model } = require('./base');

class WebhookDelivery extends Model {
  static tableName = 'webhook_deliveries';
  
  static fields = {
    guildId: { type: 'string', required: true },
    subscriptionId: { type: 'number' },
    eventType: { type: 'string', required: true },
    agentName: { type: 'string', required: true },
    webhookUrl: { type: 'string', required: true },
    status: { type: 'string', required: true }, // success, failed, rate_limited
    statusCode: { type: 'number' },
    payloadSize: { type: 'number' },
    responseTimeMs: { type: 'number' },
    errorMessage: { type: 'string' },
    retryCount: { type: 'number', default: 0 },
    createdAt: { type: 'number', default: () => Date.now() },
    deliveredAt: { type: 'number' },
  };

  static async logDelivery(data) {
    const delivery = new WebhookDelivery(data);
    await delivery.save();
    return delivery;
  }

  static async getStats(guildId, days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = await this.db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
        AVG(responseTimeMs) as avgResponseTime
      FROM webhook_deliveries 
      WHERE guildId = ? AND createdAt > ?`,
      [guildId, cutoff]
    );
    return rows[0] || { total: 0, successes: 0, failures: 0, avgResponseTime: 0 };
  }
}

module.exports = WebhookDelivery;