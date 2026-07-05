// tools/database/models/WebhookConfig.js
const { Model } = require('./base');

class WebhookConfig extends Model {
  static tableName = 'webhook_configs';
  
  static fields = {
    guildId: { type: 'string', required: true, unique: true },
    rateLimitPerMinute: { type: 'number', default: 10 },
    maxPayloadSize: { type: 'number', default: 8000 },
    retryAttempts: { type: 'number', default: 3 },
    retryBackoffMs: { type: 'number', default: 5000 },
    enableFallback: { type: 'number', default: 0 }, // 0 or 1
    createdAt: { type: 'number', default: () => Date.now() },
    updatedAt: { type: 'number', default: () => Date.now() },
  };

  static async getByGuild(guildId) {
    let config = await this.findOne({ guildId });
    if (!config) {
      config = new WebhookConfig({ guildId });
      await config.save();
    }
    return config;
  }

  static async updateRateLimit(guildId, rateLimit) {
    const config = await this.getByGuild(guildId);
    config.rateLimitPerMinute = rateLimit;
    await config.save();
    return config;
  }
}

module.exports = WebhookConfig;