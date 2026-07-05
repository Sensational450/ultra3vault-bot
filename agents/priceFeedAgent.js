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
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data, period) {
  if (data.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRSI(data, period = 14) {
  if (data.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length - 1; i++) {
    const diff = data[i + 1] - data[i];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
  if (data.length < slow) return null;
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  if (emaFast === null || emaSlow === null) return null;
  const macdLine = emaFast - emaSlow;
  // Simplified signal line
  return { macd: macdLine, signal: macdLine * 0.5, histogram: macdLine * 0.5 };
}

function calculateATR(high, low, close, period = 14) {
  if (high.length < period || low.length < period || close.length < period) return null;
  const tr = [];
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  return calculateSMA(tr, period);
}

function calculateBollinger(data, period = 20, stdDev = 2) {
  const sma = calculateSMA(data, period);
  if (sma === null) return null;
  const slice = data.slice(-period);
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { middle: sma, upper: sma + stdDev * std, lower: sma - stdDev * std };
}

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
    this.historicalCache = new Map();
    this.metricsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

    // ─── User Alerts ────────────────────────────────────
    this.userAlerts = new Map();

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

    // Ensure tables
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

    await this.loadUserAlertsFromDb();
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

    // Limit total results to avoid memory bloat
    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(MAX_ALERTS_PER_USER * 10);

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

  // ────────────────────────────────────────────────────────────────
  // CONFIG MANAGEMENT
  // ────────────────────────────────────────────────────────────────

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

  // ────────────────────────────────────────────────────────────────
  // PRICE FETCHING (Multi‑Source with Failover)
  // ────────────────────────────────────────────────────────────────

  async fetchPrice(coinId, providers = null) {
    const config = await this.getGuildConfig('global');
    const providerList = providers || config.providers || PROVIDER_ORDER;
    let lastError = null;

    for (const provider of providerList) {
      try {
        const status = this.providerStatus.get(provider) || { healthy: true, failCount: 0 };
        if (!status.healthy && status.failCount > 3) {
          this.logger.debug(`Skipping unhealthy provider ${provider}`);
          continue;
        }

        const result = await this._fetchFromProvider(provider, coinId);
        if (result) {
          this.providerStatus.set(provider, { healthy: true, failCount: 0, lastCheck: Date.now() });
          return result;
        }
      } catch (err) {
        lastError = err;
        const status = this.providerStatus.get(provider) || { healthy: true, failCount: 0 };
        status.failCount = (status.failCount || 0) + 1;
        if (status.failCount > 5) status.healthy = false;
        this.providerStatus.set(provider, status);
        this.logger.warn(`Provider ${provider} failed for ${coinId}: ${err.message}`);
      }
    }

    this.logger.error(`All providers failed for ${coinId}: ${lastError?.message || 'Unknown error'}`);
    return null;
  }

  async _fetchFromProvider(provider, coinId) {
    switch (provider) {
      case 'coingecko':
        return this._fetchCoinGecko(coinId);
      case 'binance':
        return this._fetchBinance(coinId);
      case 'coinbase':
        return this._fetchCoinbase(coinId);
      case 'kraken':
        return this._fetchKraken(coinId);
      case 'dexscreener':
        return this._fetchDexScreener(coinId);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ─── Provider Implementations ──────────────────────────────

  async _fetchCoinGecko(coinId) {
    const params = {
      ids: coinId,
      vs_currencies: 'usd',
      include_24hr_change: 'true',
      include_24hr_vol: 'true',
      include_market_cap: 'true',
      include_last_updated_at: 'true',
    };
    if (this.apiKeys.coingecko) {
      params.x_cg_demo_api_key = this.apiKeys.coingecko;
    }
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', { params, timeout: 5000 });
    if (!res.data[coinId]) throw new Error(`No data for ${coinId}`);
    const data = res.data[coinId];
    return {
      price: data.usd,
      change24h: data.usd_24h_change || 0,
      volume24h: data.usd_24h_vol || 0,
      marketCap: data.usd_market_cap || 0,
      lastUpdated: data.last_updated_at || Date.now() / 1000,
      provider: 'coingecko',
    };
  }

  async _fetchBinance(coinId) {
    const symbolMap = {
      bitcoin: 'BTCUSDT',
      ethereum: 'ETHUSDT',
      solana: 'SOLUSDT',
      binancecoin: 'BNBUSDT',
      ripple: 'XRPUSDT',
      cardano: 'ADAUSDT',
      dogecoin: 'DOGEUSDT',
      polkadot: 'DOTUSDT',
      'avalanche-2': 'AVAXUSDT',
      'matic-network': 'MATICUSDT',
    };
    const symbol = symbolMap[coinId];
    if (!symbol) throw new Error(`No Binance symbol for ${coinId}`);
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { timeout: 5000 });
    const data = res.data;
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      volume24h: parseFloat(data.quoteVolume),
      marketCap: null,
      lastUpdated: Date.now() / 1000,
      provider: 'binance',
    };
  }

  async _fetchCoinbase(coinId) {
    const productMap = {
      bitcoin: 'BTC-USD',
      ethereum: 'ETH-USD',
      solana: 'SOL-USD',
      binancecoin: 'BNB-USD',
      ripple: 'XRP-USD',
      cardano: 'ADA-USD',
      dogecoin: 'DOGE-USD',
      polkadot: 'DOT-USD',
      'avalanche-2': 'AVAX-USD',
      'matic-network': 'MATIC-USD',
    };
    const product = productMap[coinId];
    if (!product) throw new Error(`No Coinbase product for ${coinId}`);
    const res = await axios.get(`https://api.coinbase.com/v2/prices/${product}/spot`, { timeout: 5000 });
    const price = parseFloat(res.data.data.amount);
    const statsRes = await axios.get(`https://api.coinbase.com/v2/prices/${product}/stats`, { timeout: 5000 });
    const stats = statsRes.data.data;
    return {
      price,
      change24h: stats ? parseFloat(stats.percent_change_24h) || 0 : 0,
      volume24h: stats ? parseFloat(stats.volume_24h) || 0 : 0,
      marketCap: null,
      lastUpdated: Date.now() / 1000,
      provider: 'coinbase',
    };
  }

  async _fetchKraken(coinId) {
    const pairMap = {
      bitcoin: 'XXBTZUSD',
      ethereum: 'XETHZUSD',
      solana: 'SOLUSD',
      binancecoin: 'BNBUSD',
      ripple: 'XRPUSD',
      cardano: 'ADAUSD',
      dogecoin: 'DOGEUSD',
      polkadot: 'DOTUSD',
      'avalanche-2': 'AVAXUSD',
      'matic-network': 'MATICUSD',
    };
    const pair = pairMap[coinId];
    if (!pair) throw new Error(`No Kraken pair for ${coinId}`);
    const res = await axios.get(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, { timeout: 5000 });
    const data = res.data.result[pair];
    if (!data) throw new Error(`No data for ${pair}`);
    return {
      price: parseFloat(data.c[0]),
      change24h: parseFloat((data.p[1] - data.p[0]) / data.p[0] * 100) || 0,
      volume24h: parseFloat(data.v[1]),
      marketCap: null,
      lastUpdated: Date.now() / 1000,
      provider: 'kraken',
    };
  }

  async _fetchDexScreener(coinId) {
    const idMap = {
      bitcoin: 'bitcoin',
      ethereum: 'ethereum',
      solana: 'solana',
      binancecoin: 'binancecoin',
      ripple: 'ripple',
      cardano: 'cardano',
      dogecoin: 'dogecoin',
      polkadot: 'polkadot',
      'avalanche-2': 'avalanche',
      'matic-network': 'matic',
    };
    const id = idMap[coinId] || coinId;
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${id}`, { timeout: 5000 });
    if (!res.data.pairs || res.data.pairs.length === 0) throw new Error(`No DEX data for ${coinId}`);
    const pair = res.data.pairs[0];
    const price = parseFloat(pair.priceUsd);
    if (!price) throw new Error(`Invalid price data`);
    return {
      price,
      change24h: parseFloat(pair.priceChange?.h24) || 0,
      volume24h: parseFloat(pair.volume?.h24) || 0,
      marketCap: parseFloat(pair.fdv) || null,
      lastUpdated: Date.now() / 1000,
      provider: 'dexscreener',
    };
  }

  // ────────────────────────────────────────────────────────────────
  // SMART CACHING
  // ────────────────────────────────────────────────────────────────

  async getPrice(coinId) {
    const cached = this.priceCache.get(coinId);
    if (cached) return cached;
    const data = await this.fetchPrice(coinId);
    if (data) {
      this.priceCache.set(coinId, data);
      if (!this.historicalCache.has(coinId)) this.historicalCache.set(coinId, []);
      const history = this.historicalCache.get(coinId);
      history.push({ price: data.price, timestamp: Date.now() });
      if (history.length > MAX_HISTORICAL_PER_COIN) history.shift();
      await this.savePriceHistory(coinId, data.price);
    }
    return data;
  }

  async savePriceHistory(coinId, price) {
    await this.db.run(`INSERT INTO price_history (coinId, price, timestamp) VALUES (?, ?, ?)`,
      [coinId, price, Date.now()]).catch(() => {});
  }

  // ────────────────────────────────────────────────────────────────
  // UPDATE ALL PRICES
  // ────────────────────────────────────────────────────────────────

  async updateAllPrices() {
    const config = await this.getGuildConfig('global');
    const coins = config.defaultCoins || DEFAULT_COINS;
    const results = [];

    for (const coinId of coins) {
      try {
        const data = await this.getPrice(coinId);
        if (data) {
          results.push({ coinId, price: data.price, change: data.change24h });
          await this.checkUserAlerts(coinId, data);
        }
        await this.sleep(500);
      } catch (err) {
        this.logger.error(`Failed to update ${coinId}: ${err.message}`);
      }
    }

    this.emit('price.batchUpdate', results);
    this.logger.debug(`Updated ${results.length} prices`);
  }

  // ────────────────────────────────────────────────────────────────
  // TECHNICAL INDICATORS
  // ────────────────────────────────────────────────────────────────

  async getIndicators(coinId) {
    const cached = this.indicatorCache.get(coinId);
    if (cached) return cached;

    const history = this.historicalCache.get(coinId) || [];
    const prices = history.map(h => h.price);
    if (prices.length < 20) return null;

    const indicators = {};
    try {
      indicators.sma20 = calculateSMA(prices, 20);
      indicators.sma50 = calculateSMA(prices, 50);
      indicators.sma200 = calculateSMA(prices, 200);
      indicators.ema12 = calculateEMA(prices, 12);
      indicators.ema26 = calculateEMA(prices, 26);
      indicators.rsi = calculateRSI(prices, 14);
      const macd = calculateMACD(prices, 12, 26, 9);
      if (macd) indicators.macd = macd;
      const bb = calculateBollinger(prices, 20, 2);
      if (bb) indicators.bollinger = bb;
      const atr = calculateATR(prices, prices, prices, 14);
      if (atr) indicators.atr = atr;
    } catch (err) {
      this.logger.debug(`Indicator calc failed for ${coinId}: ${err.message}`);
    }

    this.indicatorCache.set(coinId, indicators);
    return indicators;
  }

  // ────────────────────────────────────────────────────────────────
  // AI ANALYSIS
  // ────────────────────────────────────────────────────────────────

  async generateAIInsight(coinId, priceData) {
    if (!this.defaultConfig.enableAI) return null;
    const aiAgent = this.deps.orchestrator?.getAgent('AiChatAgent');
    if (!aiAgent) return null;

    const indicators = await this.getIndicators(coinId);
    const prompt = `Analyze ${coinId} (price: $${priceData.price}, 24h change: ${priceData.change24h}%).
Indicators: ${indicators ? JSON.stringify(indicators) : 'not available'}.
Provide a short insight (2-3 sentences) on trend, momentum, support/resistance, and risk.`;
    try {
      const insight = await aiAgent.askAI('system', 'global', prompt, { maxTokens: 100 });
      return insight;
    } catch (err) {
      this.logger.debug(`AI insight failed: ${err.message}`);
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // WHALE INTEGRATION
  // ────────────────────────────────────────────────────────────────

  async handleWhaleEvent(tx) {
    const coinId = this._mapSymbolToCoinId(tx.symbol);
    if (!coinId) return;
    const priceData = await this.getPrice(coinId);
    if (!priceData) return;

    const impactPct = (tx.usdValue / 1_000_000) * 0.1;
    const estimatedNewPrice = priceData.price * (1 + impactPct / 100);
    const embed = new EmbedBuilder()
      .setTitle(`🐋 Whale Impact: ${tx.symbol.toUpperCase()}`)
      .setDescription(`A whale transaction of $${(tx.usdValue/1e6).toFixed(2)}M was detected.`)
      .addFields(
        { name: 'Current Price', value: `$${priceData.price.toFixed(2)}`, inline: true },
        { name: 'Estimated Impact', value: `${impactPct.toFixed(2)}%`, inline: true },
        { name: 'Potential New Price', value: `$${estimatedNewPrice.toFixed(2)}`, inline: true }
      )
      .setColor(0x9b59b6)
      .setTimestamp();
    await sendWebhook('priceAlerts', { embeds: [embed] }, { username: 'PriceAgent' });
  }

  _mapSymbolToCoinId(symbol) {
    const map = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      SOL: 'solana',
      BNB: 'binancecoin',
      XRP: 'ripple',
      ADA: 'cardano',
      DOGE: 'dogecoin',
      DOT: 'polkadot',
      AVAX: 'avalanche-2',
      MATIC: 'matic-network',
    };
    return map[symbol.toUpperCase()];
  }

  // ────────────────────────────────────────────────────────────────
  // PRICE ALERTS
  // ────────────────────────────────────────────────────────────────

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

  async checkUserAlerts(coinId, priceData) {
    // Will check alerts for this coin and trigger if conditions met
    for (const [guildId, guildMap] of this.userAlerts) {
      for (const [userId, alerts] of guildMap) {
        for (const alert of alerts) {
          if (alert.coinId !== coinId) continue;
          let triggered = false;
          if (alert.direction === 'above' && priceData.price >= alert.targetPrice) triggered = true;
          if (alert.direction === 'below' && priceData.price <= alert.targetPrice) triggered = true;
          if (triggered) {
            // Send alert via channel
            const channel = this.client.channels.cache.get(alert.channelId);
            if (channel) {
              const embed = new EmbedBuilder()
                .setTitle(`🔔 Price Alert Triggered`)
                .setDescription(`**${coinId.toUpperCase()}** reached $${priceData.price}`)
                .addFields(
                  { name: 'Your target', value: `$${alert.targetPrice} (${alert.direction})`, inline: true },
                  { name: 'Current', value: `$${priceData.price}`, inline: true }
                )
                .setColor(0x00ae86);
              await channel.send({ embeds: [embed] });
            }
            // Remove alert after triggering
            const alertId = alert.id;
            await this.removeUserAlert(userId, guildId, alertId);
          }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // ANALYTICS (Gainers/Losers/Trending)
  // ────────────────────────────────────────────────────────────────

  async _updateAnalytics() {
    try {
      const config = await this.getGuildConfig('global');
      const coins = config.defaultCoins || DEFAULT_COINS;
      const results = [];
      for (const coinId of coins) {
        const data = await this.getPrice(coinId);
        if (data) {
          results.push({ coinId, price: data.price, change24h: data.change24h, volume: data.volume24h });
        }
      }
      const sorted = results.sort((a, b) => b.change24h - a.change24h);
      this.gainers = sorted.slice(0, 5);
      this.losers = sorted.slice(-5).reverse();
      this.trending = sorted.sort((a, b) => b.volume - a.volume).slice(0, 5);
      const avgChange = results.reduce((s, r) => s + r.change24h, 0) / results.length;
      this.fearGreedIndex = Math.max(0, Math.min(100, 50 + avgChange * 2));
      this.metricsCache.set('analytics', { gainers: this.gainers, losers: this.losers, trending: this.trending, fearGreed: this.fearGreedIndex });
    } catch (err) {
      this.logger.error(`Analytics update failed: ${err.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // STREAMING (WebSocket)
  // ────────────────────────────────────────────────────────────────

  _startStreaming() {
    const binanceWs = new WebSocket('wss://stream.binance.com:9443/ws');
    binanceWs.on('open', () => {
      this.logger.info('📡 Binance WebSocket connected');
      const symbols = ['btcusdt', 'ethusdt', 'solusdt'];
      const subMsg = {
        method: 'SUBSCRIBE',
        params: symbols.map(s => `${s}@ticker`),
        id: 1
      };
      binanceWs.send(JSON.stringify(subMsg));
    });
    binanceWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.e === '24hrTicker') {
          const coinId = this._mapSymbolToCoinId(msg.s.replace('USDT', ''));
          if (coinId) {
            const price = parseFloat(msg.c);
            const change = parseFloat(msg.P);
            this.priceCache.set(coinId, {
              price,
              change24h: change,
              volume24h: parseFloat(msg.q),
              lastUpdated: Date.now() / 1000,
              provider: 'binance_stream'
            });
            this.emit('price.stream', { coinId, price, change });
          }
        }
      } catch (err) {
        // ignore parse errors
      }
    });
    binanceWs.on('error', (err) => {
      this.logger.warn(`Binance WebSocket error: ${err.message}`);
      setTimeout(() => this._startStreaming(), 5000);
    });
    binanceWs.on('close', () => {
      this.logger.warn('Binance WebSocket closed, reconnecting...');
      setTimeout(() => this._startStreaming(), 5000);
    });
    this.wsConnections.set('binance', binanceWs);
  }

  // ────────────────────────────────────────────────────────────────
  // SLASH COMMANDS
  // ────────────────────────────────────────────────────────────────

  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
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
      case 'gainers':
        await this.cmdGainers(interaction);
        break;
      case 'losers':
        await this.cmdLosers(interaction);
        break;
      case 'trending':
        await this.cmdTrending(interaction);
        break;
      case 'feargreed':
        await this.cmdFearGreed(interaction);
        break;
      case 'indicators':
        await this.cmdIndicators(interaction);
        break;
      case 'insight':
        await this.cmdInsight(interaction);
        break;
      default:
        break;
    }
  }

  // ─── Command Implementations ────────────────────────────────────

  async cmdPrice(interaction) {
    const coin = interaction.options.getString('coin') || 'bitcoin';
    const data = await this.getPrice(coin);
    if (!data) return interaction.reply({ content: `Could not fetch price for ${coin}.`, ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`${coin.toUpperCase()} Price`)
      .setDescription(`$${data.price.toLocaleString()}`)
      .addFields(
        { name: '24h Change', value: `${data.change24h.toFixed(2)}%`, inline: true },
        { name: '24h Volume', value: data.volume24h ? `$${data.volume24h.toLocaleString()}` : 'N/A', inline: true },
        { name: 'Market Cap', value: data.marketCap ? `$${data.marketCap.toLocaleString()}` : 'N/A', inline: true }
      )
      .setFooter({ text: `Provider: ${data.provider || 'unknown'} • Updated: ${new Date(data.lastUpdated * 1000).toLocaleString()}` })
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

  async cmdGainers(interaction) {
    await this._updateAnalytics();
    if (!this.gainers.length) return interaction.reply('No data yet.');
    const desc = this.gainers.map((g, i) => `${i+1}. **${g.coinId}** +${g.change24h.toFixed(2)}% ($${g.price.toFixed(2)})`).join('\n');
    const embed = new EmbedBuilder().setTitle('🚀 Top Gainers (24h)').setDescription(desc).setColor(0x00ff88);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdLosers(interaction) {
    await this._updateAnalytics();
    if (!this.losers.length) return interaction.reply('No data yet.');
    const desc = this.losers.map((l, i) => `${i+1}. **${l.coinId}** ${l.change24h.toFixed(2)}% ($${l.price.toFixed(2)})`).join('\n');
    const embed = new EmbedBuilder().setTitle('📉 Top Losers (24h)').setDescription(desc).setColor(0xff4444);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdTrending(interaction) {
    await this._updateAnalytics();
    if (!this.trending.length) return interaction.reply('No data yet.');
    const desc = this.trending.map((t, i) => `${i+1}. **${t.coinId}** Volume: $${t.volume.toLocaleString()}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🔥 Trending by Volume').setDescription(desc).setColor(0xffaa00);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdFearGreed(interaction) {
    await this._updateAnalytics();
    if (this.fearGreedIndex === null) return interaction.reply('Fear & Greed index not available yet.');
    const fg = this.fearGreedIndex;
    let sentiment = 'Neutral';
    let color = 0xffaa00;
    if (fg > 70) { sentiment = 'Greed'; color = 0x00ff88; }
    else if (fg > 50) { sentiment = 'Mild Greed'; color = 0x88ff88; }
    else if (fg > 30) { sentiment = 'Mild Fear'; color = 0xffaa00; }
    else { sentiment = 'Fear'; color = 0xff4444; }
    const embed = new EmbedBuilder()
      .setTitle('😨 Fear & Greed Index')
      .setDescription(`**${fg.toFixed(0)}/100 – ${sentiment}**`)
      .setColor(color)
      .setFooter({ text: 'Based on market sentiment analysis' });
    await interaction.reply({ embeds: [embed] });
  }

  async cmdIndicators(interaction) {
    const coin = interaction.options.getString('coin') || 'bitcoin';
    const indicators = await this.getIndicators(coin);
    if (!indicators) return interaction.reply(`No indicators available for ${coin}. Need at least 20 data points.`);
    const embed = new EmbedBuilder()
      .setTitle(`📊 Technical Indicators for ${coin.toUpperCase()}`)
      .setDescription('Current values:')
      .addFields(
        { name: 'RSI (14)', value: indicators.rsi ? indicators.rsi.toFixed(2) : 'N/A', inline: true },
        { name: 'SMA 20', value: indicators.sma20 ? indicators.sma20.toFixed(2) : 'N/A', inline: true },
        { name: 'SMA 50', value: indicators.sma50 ? indicators.sma50.toFixed(2) : 'N/A', inline: true },
        { name: 'EMA 12', value: indicators.ema12 ? indicators.ema12.toFixed(2) : 'N/A', inline: true },
        { name: 'EMA 26', value: indicators.ema26 ? indicators.ema26.toFixed(2) : 'N/A', inline: true },
        { name: 'MACD', value: indicators.macd ? indicators.macd.macd.toFixed(2) : 'N/A', inline: true },
        { name: 'MACD Signal', value: indicators.macd ? indicators.macd.signal.toFixed(2) : 'N/A', inline: true },
        { name: 'Bollinger Upper', value: indicators.bollinger ? indicators.bollinger.upper.toFixed(2) : 'N/A', inline: true },
        { name: 'Bollinger Middle', value: indicators.bollinger ? indicators.bollinger.middle.toFixed(2) : 'N/A', inline: true },
        { name: 'Bollinger Lower', value: indicators.bollinger ? indicators.bollinger.lower.toFixed(2) : 'N/A', inline: true }
      )
      .setColor(0x3498db);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdInsight(interaction) {
    const coin = interaction.options.getString('coin') || 'bitcoin';
    const data = await this.getPrice(coin);
    if (!data) return interaction.reply(`Could not fetch price for ${coin}.`);
    const insight = await this.generateAIInsight(coin, data);
    const embed = new EmbedBuilder()
      .setTitle(`🧠 AI Insight for ${coin.toUpperCase()}`)
      .setDescription(insight || 'AI analysis not available.')
      .setColor(0x9b59b6)
      .setFooter({ text: 'AI-generated analysis' });
    await interaction.reply({ embeds: [embed] });
  }

  // ────────────────────────────────────────────────────────────────
  // MEMORY CLEANUP
  // ────────────────────────────────────────────────────────────────

  async cleanup() {
    this.logger.debug('🧹 PriceFeedAgent cleanup running...');
    for (const [coinId, history] of this.historicalCache) {
      if (history.length > MAX_HISTORICAL_PER_COIN) {
        this.historicalCache.set(coinId, history.slice(-MAX_HISTORICAL_PER_COIN));
      }
    }
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
  // HELPERS
  // ────────────────────────────────────────────────────────────────

  sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
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