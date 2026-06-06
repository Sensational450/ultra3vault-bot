const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class PriceFeedAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Configuration (can be per guild later)
    this.defaultConfig = {
      updateIntervalMinutes: 1,
      priceAlertChannelId: null,   // channel for price alerts
      whaleAlertChannelId: null,   // channel for whale transactions
      defaultCoins: ['bitcoin', 'ethereum', 'solana', 'binancecoin'],
      priceChangeThresholdPercent: 2, // alert if price changes more than X% since last check
    };
    this.guildConfigs = new Map();
    // Price cache: coinId -> { usd, lastTimestamp }
    this.priceCache = new Map();
    // User alerts: Map<guildId, Map<userId, Array<{coinId, targetPrice, direction, channelId}>>>
    this.userAlerts = new Map();
  }

  async init() {
    await super.init();
    await this.initDatabase();
    // Load saved user alerts from DB (optional)
    this.subscribe('job.priceUpdate', async () => {
      await this.updateAllPrices();
    });
    this.logger.info('PriceFeedAgent ready');
  }

  async initDatabase() {
    const db = this.deps.db;
    db.run(`CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      guildId TEXT,
      coinId TEXT,
      targetPrice REAL,
      direction TEXT,   -- 'above' or 'below'
      channelId TEXT,
      createdAt INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
      coinId TEXT,
      price REAL,
      timestamp INTEGER,
      PRIMARY KEY (coinId, timestamp)
    )`);
  }

  // ---------- PRICE FETCHING ----------
  async fetchPrice(coinId) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true`;
      const res = await axios.get(url, { timeout: 5000 });
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

  async updateAllPrices() {
    const config = await this.getGuildConfig('global'); // global config placeholder
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
      // Save to history (optional)
      this.savePriceHistory(coinId, newPriceData.usd);
    }
    // Check all user-defined price alerts
    await this.checkUserAlerts();
  }

  async savePriceHistory(coinId, price) {
    const db = this.deps.db;
    db.run(`INSERT INTO price_history (coinId, price, timestamp) VALUES (?, ?, ?)`,
      [coinId, price, Date.now()]);
  }

  // ---------- PRICE ALERT (global channel) ----------
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
    this.eventBus.emit('price.alert', { coinId, oldPrice, newPrice, percentChange });
  }

  // ---------- USER PRICE ALERTS (custom thresholds) ----------
  async addUserAlert(userId, guildId, coinId, targetPrice, direction, channelId) {
    const db = this.deps.db;
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO price_alerts (userId, guildId, coinId, targetPrice, direction, channelId, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [userId, guildId, coinId, targetPrice, direction, channelId, Date.now()], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Load into memory
    if (!this.userAlerts.has(guildId)) this.userAlerts.set(guildId, new Map());
    const guildAlerts = this.userAlerts.get(guildId);
    if (!guildAlerts.has(userId)) guildAlerts.set(userId, []);
    guildAlerts.get(userId).push({ coinId, targetPrice, direction, channelId });
  }

  async removeUserAlert(userId, guildId, alertId) {
    const db = this.deps.db;
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM price_alerts WHERE id = ? AND userId = ? AND guildId = ?`, [alertId, userId, guildId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Reload alerts from DB for this user (simplify: reload all)
    await this.loadUserAlerts(guildId, userId);
  }

  async loadUserAlerts(guildId, userId = null) {
    const db = this.deps.db;
    const query = userId
      ? `SELECT id, userId, coinId, targetPrice, direction, channelId FROM price_alerts WHERE guildId = ? AND userId = ?`
      : `SELECT id, userId, coinId, targetPrice, direction, channelId FROM price_alerts WHERE guildId = ?`;
    const params = userId ? [guildId, userId] : [guildId];
    const rows = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    if (!this.userAlerts.has(guildId)) this.userAlerts.set(guildId, new Map());
    const guildMap = this.userAlerts.get(guildId);
    guildMap.clear();
    for (const row of rows) {
      if (!guildMap.has(row.userId)) guildMap.set(row.userId, []);
      guildMap.get(row.userId).push({
        id: row.id,
        coinId: row.coinId,
        targetPrice: row.targetPrice,
        direction: row.direction,
        channelId: row.channelId,
      });
    }
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
            // Remove alert after triggering (or keep? We'll remove)
            await this.removeUserAlert(userId, guildId, alert.id);
          }
        }
      }
    }
  }

  // ---------- WHALE ALERT (mock / replace with real API) ----------
  async checkWhaleTransactions() {
    // This would call a whale alert API or parse on-chain data
    // For demo, we'll simulate occasional alerts
    if (Math.random() < 0.1) { // 10% chance each update cycle
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

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, options, user, guild, channel } = interaction;

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
    const coin = options.getString('coin') || 'bitcoin';
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
    const coin = options.getString('coin');
    const target = options.getNumber('target');
    const direction = options.getString('direction');
    const channelTarget = options.getChannel('channel') || interaction.channel;
    if (!channelTarget.isTextBased()) return interaction.reply({ content: 'Channel must be text.', ephemeral: true });
    const exists = this.priceCache.has(coin);
    if (!exists) return interaction.reply({ content: `Coin "${coin}" not tracked.`, ephemeral: true });
    await this.addUserAlert(interaction.user.id, interaction.guild.id, coin, target, direction, channelTarget.id);
    await interaction.reply({ content: `✅ Alert set: ${coin} ${direction} $${target} → will be sent to ${channelTarget}.`, ephemeral: true });
  }

  async cmdMyAlerts(interaction) {
    await this.loadUserAlerts(interaction.guild.id, interaction.user.id);
    const userAlerts = this.userAlerts.get(interaction.guild.id)?.get(interaction.user.id) || [];
    if (userAlerts.length === 0) return interaction.reply({ content: 'You have no active price alerts.', ephemeral: true });
    let desc = '';
    for (const alert of userAlerts) {
      desc += `**ID:** ${alert.id} | ${alert.coinId} ${alert.direction} $${alert.targetPrice}\n`;
    }
    const embed = new EmbedBuilder().setTitle('Your Price Alerts').setDescription(desc).setColor(0x88aaff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdRemoveAlert(interaction) {
    const alertId = options.getInteger('id');
    await this.removeUserAlert(interaction.user.id, interaction.guild.id, alertId);
    await interaction.reply({ content: `Alert ${alertId} removed.`, ephemeral: true });
  }

  async cmdSetPriceChannel(interaction) {
    const channel = options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply({ content: 'Text channel required.', ephemeral: true });
    const config = await this.getGuildConfig(interaction.guild.id);
    config.priceAlertChannelId = channel.id;
    this.guildConfigs.set(interaction.guild.id, config);
    await interaction.reply({ content: `Price alert channel set to ${channel}.`, ephemeral: true });
  }

  async cmdSetWhaleChannel(interaction) {
    const channel = options.getChannel('channel');
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