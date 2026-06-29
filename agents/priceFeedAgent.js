/**
 * 📈 PriceFeedAgent v5.2 – Centralized Webhooks
 * - Fetches prices with API key and delay to avoid rate limits
 * - Uses `this.emit` for all events (baseAgent method)
 * - Guild configuration stored in DB (price channel)
 * - Price cache restored from DB on startup
 * - User alerts stored in DB (already persistent)
 * - Auto‑sets price alert channel from DEFAULT_PRICE_ALERT_CHANNEL_ID on startup
 * - Sends price alerts via "Maven" webhook (key: 'priceAlerts') with fallback to channel.send
 * - Whale alerts removed – handled by WhaleAgent
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js'); // removed WebhookClient
const axios = require('axios');
const { sendWebhook } = require('../index'); // ✅ centralized helper

class PriceFeedAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.defaultConfig = {
      updateIntervalMinutes: 1,
      priceAlertChannelId: null,
      defaultCoins: ['bitcoin', 'ethereum', 'solana', 'binancecoin'],
      priceChangeThresholdPercent: 2,
    };
    this.priceCache = new Map();          // coinId -> { usd, lastUpdatedAt }
    this.userAlerts = new Map();          // loaded from DB on init
  }

  async init() {
    await super.init();
    // Ensure guild_configs table exists (migration 004 already does, but safe)
    await this.ensureTable(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT,
        configKey TEXT,
        config TEXT,
        PRIMARY KEY (guildId, configKey)
      )
    `);
    await this.loadUserAlertsFromDb();
    await this.restorePriceCacheFromHistory();
    await this.ensureDefaultPriceChannel();  // 👈 auto‑subscribe price channel
    this.subscribe('job.priceUpdate', async () => {
      await this.updateAllPrices();
    });
    const hasPriceWebhook = !!process.env.PRICE_WEBHOOK_URL;
    this.logger.info(`📈 PriceFeedAgent v5.2 ready (price webhook: ${hasPriceWebhook ? '✅' : '❌'})`);
  }

  // ---------- PERSISTENT GUILD CONFIG ----------
  async getGuildConfig(guildId) {
    const row = await this.db.get(
      `SELECT config FROM guild_configs WHERE guildId = ? AND configKey = 'pricefeed'`,
      [guildId]
    );
    if (row) return JSON.parse(row.config);
    const defaultConfig = { ...this.defaultConfig };
    await this.db.run(
      `INSERT INTO guild_configs (guildId, configKey, config) VALUES (?, 'pricefeed', ?)`,
      [guildId, JSON.stringify(defaultConfig)]
    );
    return defaultConfig;
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, 'pricefeed', ?)`,
      [guildId, JSON.stringify(config)]
    );
  }

  // ---------- RESTORE PRICE CACHE FROM HISTORY ----------
  async restorePriceCacheFromHistory() {
    try {
      const rows = await this.db.all(`
        SELECT coinId, price, timestamp FROM price_history
        WHERE timestamp IN (
          SELECT MAX(timestamp) FROM price_history GROUP BY coinId
        )
      `);
      for (const row of rows) {
        this.priceCache.set(row.coinId, { usd: row.price, lastUpdatedAt: row.timestamp / 1000 });
      }
      this.logger.debug(`Restored price cache for ${this.priceCache.size} coins`);
    } catch (err) {
      this.logger.warn(`Could not restore price cache: ${err.message}`);
    }
  }

  // ---------- USER ALERTS ----------
  async loadUserAlertsFromDb(guildId = null, userId = null) {
    let query = `SELECT id, userId, guildId, coinId, targetPrice, direction, channelId FROM price_alerts`;
    let params = [];
    if (guildId && userId) {
      query += ` WHERE guildId = ? AND userId = ?`;
      params = [guildId, userId];
    } else if (guildId) {
      query += ` WHERE guildId = ?`;
      params = [guildId];
    }
    try {
      const rows = await this.db.all(query, params);
      if (guildId) {
        this.userAlerts.set(guildId, new Map());
      } else {
        this.userAlerts.clear();
      }
      for (const row of rows) {
        if (!this.userAlerts.has(row.guildId)) this.userAlerts.set(row.guildId, new Map());
        const guildMap = this.userAlerts.get(row.guildId);
        if (!guildMap.has(row.userId)) guildMap.set(row.userId, []);
        guildMap.get(row.userId).push({
          id: row.id,
          coinId: row.coinId,
          targetPrice: row.targetPrice,
          direction: row.direction,
          channelId: row.channelId,
        });
      }
    } catch (err) {
      this.logger.warn(`Could not load price alerts: ${err.message}`);
    }
  }

  // ---------- DEFAULT PRICE CHANNEL SETUP ----------
  async ensureDefaultPriceChannel() {
    const defaultChannelId = process.env.DEFAULT_PRICE_ALERT_CHANNEL_ID;
    if (!defaultChannelId) return;
    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    const config = await this.getGuildConfig(guild.id);
    if (config.priceAlertChannelId) return;
    const channel = this.client.channels.cache.get(defaultChannelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Default price channel ${defaultChannelId} not found`);
      return;
    }
    await this.updateGuildConfig(guild.id, { priceAlertChannelId: defaultChannelId });
    this.logger.info(`✅ Auto-set price alert channel to ${channel.name}`);
  }

  // ---------- PRICE FETCHING ----------
  async fetchPrice(coinId) {
    try {
      const params = { ids: coinId, vs_currencies: 'usd', include_last_updated_at: true };
      if (process.env.COINGECKO_API_KEY) {
        params.x_cg_demo_api_key = process.env.COINGECKO_API_KEY;
      }
      const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', { params, timeout: 5000 });
      if (!res.data[coinId]) throw new Error(`No data for ${coinId}`);
      return {
        usd: res.data[coinId].usd,
        lastUpdatedAt: res.data[coinId].last_updated_at || Date.now() / 1000,
      };
    } catch (err) {
      this.logger.error(`Price fetch error for ${coinId}: ${err.message}`);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async updateAllPrices() {
    const config = await this.getGuildConfig('global');
    const coins = config.defaultCoins;
    for (const coinId of coins) {
      const newPriceData = await this.fetchPrice(coinId);
      if (!newPriceData) continue;
      const oldPriceData = this.priceCache.get(coinId);
      this.priceCache.set(coinId, newPriceData);
      if (oldPriceData) {
        const percentChange = ((newPriceData.usd - oldPriceData.usd) / oldPriceData.usd) * 100;
        if (Math.abs(percentChange) >= config.priceChangeThresholdPercent) {
          await this.sendPriceAlert(coinId, oldPriceData.usd, newPriceData.usd, percentChange);
        }
      }
      await this.savePriceHistory(coinId, newPriceData.usd);
      await this.sleep(1000);
    }
    await this.checkUserAlerts();
  }

  async savePriceHistory(coinId, price) {
    await this.db.run(`INSERT INTO price_history (coinId, price, timestamp) VALUES (?, ?, ?)`,
      [coinId, price, Date.now()]).catch(() => {});
  }

  // ---------- PRICE ALERT (centralized webhook + fallback) ----------
  async sendPriceAlert(coinId, oldPrice, newPrice, percentChange) {
    const config = await this.getGuildConfig('global');
    const channelId = config.priceAlertChannelId;
    if (!channelId) return;

    const embed = new EmbedBuilder()
      .setTitle(`🚨 Price Alert: ${coinId.toUpperCase()}`)
      .setDescription(`**${percentChange > 0 ? '📈 UP' : '📉 DOWN'}** ${Math.abs(percentChange).toFixed(2)}%`)
      .addFields(
        { name: 'Old Price', value: `$${oldPrice}`, inline: true },
        { name: 'New Price', value: `$${newPrice}`, inline: true },
        { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
      )
      .setColor(percentChange > 0 ? 0x00ff00 : 0xff0000);

    // 1. Try webhook if configured
    if (process.env.PRICE_WEBHOOK_URL) {
      try {
        await sendWebhook('priceAlerts', { embeds: [embed] }, { username: 'Maven' });
        this.logger.debug(`✅ Price alert sent via Maven webhook (${coinId})`);
        this.emit('price.alert', { coinId, oldPrice, newPrice, percentChange });
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to channel.send`);
      }
    }

    // 2. Fallback to channel.send
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Channel ${channelId} not found or not text-based`);
      return;
    }
    await channel.send({ embeds: [embed] });
    this.logger.debug(`✅ Price alert sent via channel.send to #${channel.name}`);
    this.emit('price.alert', { coinId, oldPrice, newPrice, percentChange });
  }

  // ---------- USER ALERTS (unchanged) ----------
  async addUserAlert(userId, guildId, coinId, targetPrice, direction, channelId) {
    const result = await this.db.run(
      `INSERT INTO price_alerts (userId, guildId, coinId, targetPrice, direction, channelId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, guildId, coinId, targetPrice, direction, channelId, Date.now()]
    );
    const alertId = result.lastID;
    if (!this.userAlerts.has(guildId)) this.userAlerts.set(guildId, new Map());
    const guildMap = this.userAlerts.get(guildId);
    if (!guildMap.has(userId)) guildMap.set(userId, []);
    guildMap.get(userId).push({ id: alertId, coinId, targetPrice, direction, channelId });
  }

  async removeUserAlert(userId, guildId, alertId) {
    await this.db.run(`DELETE FROM price_alerts WHERE id = ? AND userId = ? AND guildId = ?`, [alertId, userId, guildId]);
    await this.loadUserAlertsFromDb(guildId, userId);
  }

  async checkUserAlerts() {
    for (const [guildId, guildAlerts] of this.userAlerts.entries()) {
      for (const [userId, alerts] of guildAlerts.entries()) {
        for (const alert of alerts) {
          const currentPrice = this.priceCache.get(alert.coinId)?.usd;
          if (!currentPrice) continue;
          let triggered = false;
          if (alert.direction === 'above' && currentPrice >= alert.targetPrice) triggered = true;
          if (alert.direction === 'below' && currentPrice <= alert.targetPrice) triggered = true;
          if (triggered) {
            const channel = this.client.channels.cache.get(alert.channelId);
            if (channel) {
              const user = await this.client.users.fetch(userId).catch(() => null);
              const embed = new EmbedBuilder()
                .setTitle(`🔔 Price Alert Triggered`)
                .setDescription(`${user ? user.toString() : userId}, **${alert.coinId.toUpperCase()}** reached $${currentPrice}`)
                .addFields(
                  { name: 'Your target', value: `$${alert.targetPrice} (${alert.direction})`, inline: true },
                  { name: 'Current', value: `$${currentPrice}`, inline: true }
                )
                .setColor(0x00ae86);
              await channel.send({ embeds: [embed] });
            }
            await this.removeUserAlert(userId, guildId, alert.id);
          }
        }
      }
    }
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, options } = interaction;
    switch (commandName) {
      case 'price':
        await this.cmdPrice(interaction);
        break;
      case 'setpricealert':
        await this.cmdSetPriceAlert(interaction);
        break;
      case 'myalerts':
        await this.cmdMyAlerts(interaction);
        break;
      case 'removealert':
        await this.cmdRemoveAlert(interaction);
        break;
      case 'setpricechannel':
        if (!interaction.member.permissions.has('Administrator')) return this.deny(interaction);
        await this.cmdSetPriceChannel(interaction);
        break;
    }
  }

  async cmdPrice(interaction) {
    const coin = interaction.options.getString('coin') || 'bitcoin';
    const priceData = await this.fetchPrice(coin);
    if (!priceData) return interaction.reply({ content: `Could not fetch price for ${coin}.`, ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`${coin.toUpperCase()} Price`)
      .setDescription(`$${priceData.usd.toLocaleString()}`)
      .setFooter({ text: `Last updated: ${new Date(priceData.lastUpdatedAt * 1000).toLocaleString()}` })
      .setColor(0x00ae86);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdSetPriceAlert(interaction) {
    const coin = interaction.options.getString('coin');
    const target = interaction.options.getNumber('target');
    const direction = interaction.options.getString('direction');
    const channelTarget = interaction.options.getChannel('channel') || interaction.channel;
    if (!channelTarget.isTextBased()) return interaction.reply({ content: 'Channel must be text.', ephemeral: true });
    if (!this.priceCache.has(coin)) return interaction.reply({ content: `Coin "${coin}" not tracked.`, ephemeral: true });
    await this.addUserAlert(interaction.user.id, interaction.guild.id, coin, target, direction, channelTarget.id);
    await interaction.reply({ content: `✅ Alert set: ${coin} ${direction} $${target} → will be sent to ${channelTarget}.`, ephemeral: true });
  }

  async cmdMyAlerts(interaction) {
    await this.loadUserAlertsFromDb(interaction.guild.id, interaction.user.id);
    const userAlerts = this.userAlerts.get(interaction.guild.id)?.get(interaction.user.id) || [];
    if (userAlerts.length === 0) return interaction.reply({ content: 'You have no active price alerts.', ephemeral: true });
    let desc = '';
    for (const alert of userAlerts) desc += `**ID:** ${alert.id} | ${alert.coinId} ${alert.direction} $${alert.targetPrice}\n`;
    const embed = new EmbedBuilder().setTitle('Your Price Alerts').setDescription(desc).setColor(0x88aaff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdRemoveAlert(interaction) {
    const alertId = interaction.options.getInteger('id');
    await this.removeUserAlert(interaction.user.id, interaction.guild.id, alertId);
    await interaction.reply({ content: `Alert ${alertId} removed.`, ephemeral: true });
  }

  async cmdSetPriceChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply({ content: 'Text channel required.', ephemeral: true });
    await this.updateGuildConfig(interaction.guild.id, { priceAlertChannelId: channel.id });
    await interaction.reply({ content: `Price alert channel set to ${channel}.`, ephemeral: true });
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = PriceFeedAgent;