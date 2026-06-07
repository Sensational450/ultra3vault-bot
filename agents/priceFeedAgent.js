/**
 * 📈 PriceFeedAgent v5.0 (fixed)
 * - Fetches prices with API key and delay to avoid rate limits
 * - Emits events using `this.emit` (baseAgent method)
 * - Handles missing eventBus gracefully
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class PriceFeedAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.defaultConfig = {
      updateIntervalMinutes: 1,
      priceAlertChannelId: null,
      whaleAlertChannelId: null,
      defaultCoins: ['bitcoin', 'ethereum', 'solana', 'binancecoin'],
      priceChangeThresholdPercent: 2,
    };
    this.guildConfigs = new Map();
    this.priceCache = new Map();
    this.userAlerts = new Map();
  }

  async init() {
    await super.init();
    await this.loadUserAlertsFromDb();
    this.subscribe('job.priceUpdate', async () => {
      await this.updateAllPrices();
    });
    this.logger.info('📈 PriceFeedAgent ready');
  }

  async loadUserAlertsFromDb(guildId = null, userId = null) {
    const db = this.deps.db;
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
      const rows = await db.all(query, params);
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

  async fetchPrice(coinId) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true`;
      const headers = {};
      const params = { ids: coinId, vs_currencies: 'usd', include_last_updated_at: true };
      if (process.env.COINGECKO_API_KEY) {
        params.x_cg_demo_api_key = process.env.COINGECKO_API_KEY;
      }
      const res = await axios.get(url, { params, timeout: 5000 });
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
      await this.sleep(1000); // 1 second delay between coins
    }
    await this.checkUserAlerts();
    await this.checkWhaleTransactions();
  }

  async savePriceHistory(coinId, price) {
    const db = this.deps.db;
    await db.run(`INSERT INTO price_history (coinId, price, timestamp) VALUES (?, ?, ?)`,
      [coinId, price, Date.now()]).catch(() => {});
  }

  async sendPriceAlert(coinId, oldPrice, newPrice, percentChange) {
    const config = await this.getGuildConfig('global');
    const channelId = config.priceAlertChannelId;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(`🚨 Price Alert: ${coinId.toUpperCase()}`)
      .setDescription(`**${percentChange > 0 ? '📈 UP' : '📉 DOWN'}** ${Math.abs(percentChange).toFixed(2)}%`)
      .addFields(
        { name: 'Old Price', value: `$${oldPrice}`, inline: true },
        { name: 'New Price', value: `$${newPrice}`, inline: true },
        { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
      )
      .setColor(percentChange > 0 ? 0x00ff00 : 0xff0000);
    await channel.send({ embeds: [embed] });
    this.emit('price.alert', { coinId, oldPrice, newPrice, percentChange });
  }

  async addUserAlert(userId, guildId, coinId, targetPrice, direction, channelId) {
    const db = this.deps.db;
    const result = await db.run(
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
    const db = this.deps.db;
    await db.run(`DELETE FROM price_alerts WHERE id = ? AND userId = ? AND guildId = ?`, [alertId, userId, guildId]);
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

  async checkWhaleTransactions() {
    if (Math.random() < 0.05) {
      const mockWhale = {
        coin: 'bitcoin',
        amount: Math.floor(Math.random() * 1000) + 100,
        fromExchange: 'Binance',
        toExchange: 'Unknown',
        txHash: '0x' + Math.random().toString(36).substring(2, 10),
      };
      const config = await this.getGuildConfig('global');
      const channelId = config.whaleAlertChannelId;
      if (channelId) {
        const channel = this.client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle(`🐋 Whale Alert`)
            .setDescription(`${mockWhale.amount.toLocaleString()} ${mockWhale.coin.toUpperCase()} moved`)
            .addFields(
              { name: 'From', value: mockWhale.fromExchange, inline: true },
              { name: 'To', value: mockWhale.toExchange, inline: true },
              { name: 'TX', value: `[View](${mockWhale.txHash})`, inline: true }
            )
            .setColor(0xff6600);
          await channel.send({ embeds: [embed] });
        }
      }
    }
  }

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
      case 'setwhalechannel':
        if (!interaction.member.permissions.has('Administrator')) return this.deny(interaction);
        await this.cmdSetWhaleChannel(interaction);
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
    const config = await this.getGuildConfig(interaction.guild.id);
    config.priceAlertChannelId = channel.id;
    this.guildConfigs.set(interaction.guild.id, config);
    await interaction.reply({ content: `Price alert channel set to ${channel}.`, ephemeral: true });
  }

  async cmdSetWhaleChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply({ content: 'Text channel required.', ephemeral: true });
    const config = await this.getGuildConfig(interaction.guild.id);
    config.whaleAlertChannelId = channel.id;
    this.guildConfigs.set(interaction.guild.id, config);
    await interaction.reply({ content: `Whale alert channel set to ${channel}.`, ephemeral: true });
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    this.guildConfigs.set(guildId, { ...this.defaultConfig });
    return this.guildConfigs.get(guildId);
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = PriceFeedAgent;