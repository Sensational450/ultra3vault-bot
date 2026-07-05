/**
 * 📈 PriceFeedAgent v6.1 – Memory‑Optimized Market Data Engine
 * 
 * Features (all from v6.0) with memory‑safe data loading and cleanup.
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { sendWebhook } = require('../core/webhook');
const NodeCache = require('node-cache');
const WebSocket = require('ws');

// ─── Constants ───────────────────────────────────────────────
const DEFAULT_COINS = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'cardano', 'dogecoin', 'polkadot', 'avalanche-2', 'matic-network'];
const PROVIDER_ORDER = ['coingecko', 'binance', 'coinbase', 'kraken', 'dexscreener'];
const MAX_HISTORICAL_PER_COIN = 200;
const MAX_ALERTS_PER_USER = 100;
const MAX_COINS_TO_RESTORE = 50;

// ─── Helper functions (same as v6.0) ──────────────────────
function calculateSMA(data, period) { /* ... */ }
function calculateEMA(data, period) { /* ... */ }
function calculateRSI(data, period) { /* ... */ }
function calculateMACD(data, fast, slow, signal) { /* ... */ }
function calculateATR(high, low, close, period) { /* ... */ }
function calculateBollinger(data, period, stdDev) { /* ... */ }

// ─── Main Agent ──────────────────────────────────────────────

class PriceFeedAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ─── Configuration ──────────────────────────────────
    this.defaultConfig = {
      updateIntervalMinutes: 1,
      priceAlertChannelId: null,
      defaultCoins: DEFAULT_COINS,
      priceChangeThresholdPercent: 2,
      providers: PROVIDER_ORDER,
      maxRetries: 3,
      cacheTTL: 30,
      enableAI: true,
      enableStreaming: process.env.ENABLE_PRICE_STREAMING === 'true',
      enableIndicators: true,
      enableAnalytics: true,
      adaptiveRefresh: true,
    };

    // ─── Caches ─────────────────────────────────────────
    this.priceCache = new NodeCache({ stdTTL: 30, checkperiod: 10 });
    this.indicatorCache = new NodeCache({ stdTTL: 60, checkperiod: 20 });
    this.historicalCache = new Map(); // coinId → array (max 200)
    this.metricsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

    // ─── User Alerts ────────────────────────────────────
    this.userAlerts = new Map(); // guildId → Map(userId → alerts)

    // ─── Provider Status ────────────────────────────────
    this.providerStatus = new Map();

    // ─── Streaming ──────────────────────────────────────
    this.wsConnections = new Map();
    this.streamListeners = new Map();

    // ─── Analytics ──────────────────────────────────────
    this.gainers = [];
    this.losers = [];
    this.trending = [];
    this.fearGreedIndex = null;

    // ─── Health ─────────────────────────────────────────
    this._startTime = Date.now();
    this._lastCleanup = Date.now();

    // ─── API Keys ───────────────────────────────────────
    this.apiKeys = {
      coingecko: process.env.COINGECKO_API_KEY,
      binance: process.env.BINANCE_API_KEY,
      coinbase: process.env.COINBASE_API_KEY,
      kraken: process.env.KRAKEN_API_KEY,
      dexscreener: process.env.DEXSCREENER_API_KEY,
    };

    this.requestQueue = [];
    this.processingQueue = false;
    this.maxConcurrent = 5;
  }

  // ────────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────────

  async init() {
    await super.init();

    // Ensure tables (same as v6.0)
    await this.ensureTable(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT, configKey TEXT, config TEXT,
        PRIMARY KEY (guildId, configKey)
      );
      CREATE TABLE IF NOT EXISTS price_history (
        coinId TEXT, price REAL, timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT, guildId TEXT, coinId TEXT,
        targetPrice REAL, direction TEXT, channelId TEXT,
        createdAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS price_indicators (
        coinId TEXT, indicator TEXT, value REAL, timestamp INTEGER
      );
    `);

    // Load only alerts for guilds the bot is in
    await this.loadUserAlertsFromDb();

    // Restore price cache with a limit
    await this.restorePriceCacheFromHistory();

    // Subscribe to jobs
    this.subscribe('job.priceUpdate', async () => {
      await this.updateAllPrices();
    });

    this.subscribe('whale.detected', async (tx) => {
      await this.handleWhaleEvent(tx);
    });

    this.subscribe('signal.requestPrice', async ({ coinId }) => {
      return this.getPrice(coinId);
    });

    // Start streaming only if enabled
    if (this.defaultConfig.enableStreaming) {
      this._startStreaming();
    }

    // Start analytics updater
    setInterval(() => this._updateAnalytics(), 5 * 60 * 1000);

    // Run a cleanup cycle to trim any loaded data
    await this.cleanup();

    const hasPriceWebhook = !!process.env.PRICE_WEBHOOK_URL;
    this.logger.info(`📈 PriceFeedAgent v6.1 ready (price webhook: ${hasPriceWebhook ? '✅' : '❌'})`);
  }

  // ────────────────────────────────────────────────────────────────
  // DATA LOADING (Memory‑Safe)
  // ────────────────────────────────────────────────────────────────

  async restorePriceCacheFromHistory() {
    try {
      const rows = await this.db.all(`
        SELECT coinId, price, timestamp FROM price_history
        WHERE timestamp IN (
          SELECT MAX(timestamp) FROM price_history GROUP BY coinId
        )
        LIMIT ?
      `, [MAX_COINS_TO_RESTORE]);
      for (const row of rows) {
        this.priceCache.set(row.coinId, {
          price: row.price,
          lastUpdated: row.timestamp / 1000,
        });
      }
      this.logger.debug(`Restored price cache for ${rows.length} coins`);
    } catch (err) {
      this.logger.warn(`Could not restore price cache: ${err.message}`);
    }
  }

  async loadUserAlertsFromDb(guildId = null, userId = null) {
    // Get the list of guilds the bot is actually in
    const botGuilds = this.client.guilds.cache.map(g => g.id);
    let query = `SELECT id, userId, guildId, coinId, targetPrice, direction, channelId FROM price_alerts`;
    let params = [];
    const conditions = [];

    if (guildId && userId) {
      conditions.push('guildId = ? AND userId = ?');
      params = [guildId, userId];
    } else if (guildId) {
      conditions.push('guildId = ?');
      params = [guildId];
    } else {
      // Only load for guilds the bot is in
      if (botGuilds.length > 0) {
        const placeholders = botGuilds.map(() => '?').join(',');
        conditions.push(`guildId IN (${placeholders})`);
        params = botGuilds;
      } else {
        conditions.push('1 = 0'); // No guilds
      }
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Limit per user to 100 alerts (to avoid memory bloat)
    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(MAX_ALERTS_PER_USER * 10); // reasonable total cap

    try {
      const rows = await this.db.all(query, params);
      // Clear existing
      if (!guildId) {
        this.userAlerts.clear();
      } else if (guildId) {
        this.userAlerts.delete(guildId);
      }

      for (const row of rows) {
        if (!this.userAlerts.has(row.guildId)) {
          this.userAlerts.set(row.guildId, new Map());
        }
        const guildMap = this.userAlerts.get(row.guildId);
        if (!guildMap.has(row.userId)) {
          guildMap.set(row.userId, []);
        }
        const userAlerts = guildMap.get(row.userId);
        // Only keep the most recent MAX_ALERTS_PER_USER per user
        if (userAlerts.length >= MAX_ALERTS_PER_USER) continue;
        userAlerts.push({
          id: row.id,
          coinId: row.coinId,
          targetPrice: row.targetPrice,
          direction: row.direction,
          channelId: row.channelId,
        });
      }
      this.logger.debug(`Loaded ${rows.length} user alerts from DB`);
    } catch (err) {
      this.logger.warn(`Could not load price alerts: ${err.message}`);
    }
  }

  // ─── (All other methods from v6.0 remain the same) ────────────
  // ... (fetchPrice, getPrice, updateAllPrices, etc.)
  // ────────────────────────────────────────────────────────────────

  // ─── MEMORY CLEANUP (Enhanced) ──────────────────────────────

  async cleanup() {
    this.logger.debug('🧹 PriceFeedAgent cleanup running...');
    // Trim historical cache
    for (const [coinId, history] of this.historicalCache) {
      if (history.length > MAX_HISTORICAL_PER_COIN) {
        this.historicalCache.set(coinId, history.slice(-MAX_HISTORICAL_PER_COIN));
      }
    }
    // Clear expired caches (NodeCache does this automatically, but we force)
    this.priceCache.flushAll();
    this.indicatorCache.flushAll();
    this.metricsCache.flushAll();
    this._lastCleanup = Date.now();
  }

  async clearCache() {
    return this.cleanup();
  }

  async aggressiveCleanup() {
    this.logger.warn('🔥 PriceFeedAgent aggressive cleanup running...');
    this.priceCache.flushAll();
    this.indicatorCache.flushAll();
    this.metricsCache.flushAll();
    this.historicalCache.clear();
    this.userAlerts.clear();
    // Close WebSocket connections
    for (const [provider, ws] of this.wsConnections) {
      try { ws.close(); } catch (e) {}
    }
    this.wsConnections.clear();
    if (this.defaultConfig.enableStreaming) {
      this._startStreaming();
    }
    this._lastCleanup = Date.now();
  }

  // ────────────────────────────────────────────────────────────────
  // DESTROY
  // ────────────────────────────────────────────────────────────────

  async destroy() {
    for (const [provider, ws] of this.wsConnections) {
      try { ws.close(); } catch (e) {}
    }
    this.wsConnections.clear();
    await super.destroy();
  }
}

module.exports = PriceFeedAgent;