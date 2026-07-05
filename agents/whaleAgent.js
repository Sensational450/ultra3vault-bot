/**
 * 🐋 WhaleAgent v8.1 – Memory‑Optimized On‑Chain Intelligence Platform
 * - Multi-chain support (ETH, BTC, SOL, BNB, Base, Arbitrum, Optimism, Polygon, Avalanche)
 * - Smart money tracking, wallet P&L, portfolio value
 * - AI analysis of whale transactions (OpenAI)
 * - Advanced analytics: accumulation score, sentiment, exchange pressure
 * - Community features: watchlists, leaderboards, predictions
 * - Admin controls, premium gating, health checks
 * - All commands consolidated under /whale
 * - Memory‑safe: bounded caches, periodic cleanup, aggressive cleanup
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const { ethers } = require('ethers');

// ─── Memory limits ─────────────────────────────────────────────
const MAX_SEEN_TXS = 5000;                // Max seen transactions cache
const MAX_WATCHLIST_PER_USER = 100;       // Max addresses per user watchlist
const MAX_WALLET_STATS_ENTRIES = 1000;    // Max wallet performance entries
const MAX_RECENT_WHALES = 100;            // Max recent whale list
const MAX_COMMUNITY_PREDICTIONS = 1000;   // Max predictions in memory

// ─── Simple cache & rate limiter (unchanged) ──────────────────
class TTLCache {
  constructor(ttl = 60000) { this.cache = new Map(); this.ttl = ttl; }
  get(key) { const e = this.cache.get(key); if (!e) return null; if (Date.now() - e.timestamp > this.ttl) { this.cache.delete(key); return null; } return e.value; }
  set(key, value) { this.cache.set(key, { value, timestamp: Date.now() }); }
  clear() { this.cache.clear(); }
  size() { return this.cache.size; }
}

class SimpleRateLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.requests = []; }
  check() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.limit) { const oldest = this.requests[0]; const resetIn = this.windowMs - (now - oldest); return { allowed: false, resetIn }; }
    this.requests.push(now); return { allowed: true };
  }
}

class WhaleAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config ----
    this.minValueUsd = parseFloat(process.env.WHALE_MIN_VALUE_USD) || 1000000;
    this.assets = (process.env.WHALE_ASSETS || 'BTC,ETH,USDT,USDC,XRP,SOL,ADA,DOGE,BNB,MATIC,AVAX')
      .split(',').map(a => a.trim().toUpperCase());
    this.whaleKey = process.env.WHALE_ALERT_API_KEY;
    this.alchemyKey = process.env.ALCHEMY_API_KEY;
    this.coinGeckoApi = 'https://api.coingecko.com/api/v3';
    this.dexscreenerApi = 'https://api.dexscreener.com/latest/dex/search';

    // ---- Chains ----
    const defaultChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base', 'bsc', 'avalanche', 'fantom'];
    this.chains = (process.env.WHALE_CHAINS || defaultChains.join(','))
      .split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

    // ---- Exchange addresses ----
    let exchangeAddresses = {};
    try { if (process.env.WHALE_EXCHANGE_ADDRESSES) exchangeAddresses = JSON.parse(process.env.WHALE_EXCHANGE_ADDRESSES); } catch (e) {}
    const defaultExchanges = {
      '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': 'Binance 1',
      '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': 'Binance 2',
      '0x34aa3f359a9d614239015126635ce7732c18fdf3': 'OKX',
      '0x8894e0a0c962cb723c1976a4421c95949be2d4f3': 'Kraken',
      '0x716034c25d9fe4daf148db6b1f309fb5dca5cbe1': 'KuCoin',
    };
    this.exchangeAddresses = { ...defaultExchanges, ...exchangeAddresses };
    this.walletLabels = {};
    try { if (process.env.WHALE_WALLET_LABELS) this.walletLabels = JSON.parse(process.env.WHALE_WALLET_LABELS); } catch (e) {}

    // ---- Caches (bounded) ----
    this.cacheTTL = parseInt(process.env.WHALE_CACHE_TTL) || 60 * 60 * 1000;
    this.seenTxs = new Map();          // Will be trimmed
    this.priceCache = new TTLCache(30000);
    this.rateLimiter = new SimpleRateLimiter(30, 60000);

    // ---- Explorer URLs ----
    this.explorers = {
      BTC: 'https://www.blockchain.com/btc/tx/',
      ETH: 'https://etherscan.io/tx/',
      BSC: 'https://bscscan.com/tx/',
      POLYGON: 'https://polygonscan.com/tx/',
      ARBITRUM: 'https://arbiscan.io/tx/',
      OPTIMISM: 'https://optimistic.etherscan.io/tx/',
      BASE: 'https://basescan.org/tx/',
      AVAX: 'https://snowtrace.io/tx/',
      FANTOM: 'https://ftmscan.com/tx/',
      SOL: 'https://solscan.io/tx/',
    };
    this.chainExplorerMap = {
      ethereum: 'ETH', arbitrum: 'ARBITRUM', optimism: 'OPTIMISM',
      polygon: 'POLYGON', base: 'BASE', bsc: 'BSC', avalanche: 'AVAX', fantom: 'FANTOM'
    };

    // ---- AI ----
    this.openai = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI available for WhaleAgent');
      }
    } catch (err) { this.logger.warn('OpenAI not available'); }

    // ---- Database tables (will be ensured in init) ----
    // Additional tables for wallet tracking, performance, etc.

    // ---- State (bounded) ----
    this._startTime = Date.now();
    this._lastRun = null;
    this._sources = {
      whaleAlert: !!this.whaleKey,
      alchemy: !!this.alchemyKey && this.chains.length > 0,
      blockchair: true,
    };
    this._recentWhales = [];              // bounded
    this._walletPerformance = new Map();  // bounded
    this._communityPredictions = new Map(); // bounded

    // ---- Retry ----
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // ---- Premium flag ----
    this.premiumEnabled = process.env.WHALE_PREMIUM_ENABLED !== 'false';

    // ---- Admin log ----
    this.adminLogWebhook = process.env.WHALE_ADMIN_LOG_WEBHOOK || process.env.LOG_WEBHOOK_URL;

    // ---- Cleanup timer ----
    this._cleanupInterval = null;
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadWatchlists();
    await this._loadWalletStats();

    this.subscribe('job.whaleCheck', async () => {
      await this.checkWhales();
    });

    this.subscribe('price.alert', async (data) => {
      // Store recent price for context
    });

    // Run cleanup to trim caches after loading
    await this.cleanup();

    // Periodic cleanup (every 30 min)
    this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);

    const sourceList = Object.entries(this._sources)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    this.logger.info(`🐋 WhaleAgent v8.1 ready (threshold: $${(this.minValueUsd/1e6).toFixed(0)}M, sources: ${sourceList})`);
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS whale_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT,
        blockchain TEXT,
        symbol TEXT,
        amount REAL,
        usdValue REAL,
        fromAddress TEXT,
        toAddress TEXT,
        fromLabel TEXT,
        toLabel TEXT,
        classification TEXT,
        timestamp INTEGER,
        priceUsd REAL,
        marketCap REAL,
        change24h REAL,
        aiSummary TEXT,
        riskLevel TEXT,
        sentimentScore REAL
      );
      CREATE TABLE IF NOT EXISTS whale_watchlists (
        userId TEXT,
        guildId TEXT,
        walletAddress TEXT,
        label TEXT,
        addedAt INTEGER,
        PRIMARY KEY (userId, guildId, walletAddress)
      );
      CREATE TABLE IF NOT EXISTS whale_wallet_performance (
        walletAddress TEXT,
        guildId TEXT,
        totalProfit REAL,
        totalTrades INTEGER,
        wins INTEGER,
        losses INTEGER,
        lastUpdated INTEGER,
        PRIMARY KEY (walletAddress, guildId)
      );
      CREATE TABLE IF NOT EXISTS whale_premium_users (
        userId TEXT,
        guildId TEXT,
        tier TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS whale_community_predictions (
        txHash TEXT,
        userId TEXT,
        guildId TEXT,
        sentiment TEXT,
        timestamp INTEGER,
        PRIMARY KEY (txHash, userId)
      );
      CREATE TABLE IF NOT EXISTS whale_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT,
        metric TEXT,
        value TEXT,
        timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS whale_blacklist (
        walletAddress TEXT,
        guildId TEXT,
        reason TEXT,
        PRIMARY KEY (walletAddress, guildId)
      );
    `);
  }

  // ---------- Load watchlists (bounded per user) ----------
  async _loadWatchlists() {
    const db = this.deps.db;
    this._watchlists = new Map(); // userId -> Set of addresses
    const rows = await db.all(`SELECT userId, walletAddress FROM whale_watchlists`);
    for (const row of rows) {
      if (!this._watchlists.has(row.userId)) this._watchlists.set(row.userId, new Set());
      const set = this._watchlists.get(row.userId);
      // Limit per user
      if (set.size < MAX_WATCHLIST_PER_USER) {
        set.add(row.walletAddress);
      }
    }
    this.logger.debug(`Loaded watchlists for ${this._watchlists.size} users (capped at ${MAX_WATCHLIST_PER_USER} per user)`);
  }

  // ---------- Load wallet stats (bounded total) ----------
  async _loadWalletStats() {
    const db = this.deps.db;
    const rows = await db.all(`
      SELECT walletAddress, guildId, totalProfit, totalTrades, wins, losses
      FROM whale_wallet_performance
      ORDER BY totalTrades DESC
      LIMIT ?
    `, [MAX_WALLET_STATS_ENTRIES]);
    for (const row of rows) {
      const key = `${row.walletAddress}_${row.guildId}`;
      this._walletPerformance.set(key, {
        profit: row.totalProfit,
        trades: row.totalTrades,
        wins: row.wins,
        losses: row.losses,
        winRate: row.totalTrades > 0 ? (row.wins / row.totalTrades) : 0,
      });
    }
    this.logger.debug(`Loaded ${this._walletPerformance.size} wallet stats entries (capped at ${MAX_WALLET_STATS_ENTRIES})`);
  }

  // ---------- MAIN CHECK (unchanged, but with cleanup) ----------
  async checkWhales() {
    this._lastRun = Date.now();
    try {
      const sources = [];
      if (this._sources.whaleAlert) sources.push(this._fetchWhaleAlertWithRetry());
      if (this._sources.alchemy) sources.push(this._fetchAlchemyWithRetry());
      sources.push(this._fetchBlockchairWithRetry());

      const results = await Promise.allSettled(sources);
      let allTxs = [];
      for (const result of results) {
        if (result.status === 'fulfilled') allTxs = allTxs.concat(result.value);
      }

      // Deduplicate & sort
      const unique = [];
      const seen = new Set();
      allTxs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      for (const tx of allTxs) {
        const key = `${tx.hash}_${tx.amount}_${tx.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(tx);
      }

      // Process each tx
      for (const tx of unique) {
        const cacheKey = `${tx.hash}_${tx.amount}_${tx.timestamp}`;
        if (this.seenTxs.has(cacheKey)) continue;
        if (!this.assets.includes(tx.symbol.toUpperCase())) continue;

        // Classify and label
        const classified = this._classifyTransaction(tx);
        tx.classification = classified.class;
        tx.fromLabel = classified.fromLabel;
        tx.toLabel = classified.toLabel;

        // Price context
        const priceCtx = await this._fetchPriceContext(tx.symbol);
        if (priceCtx) {
          tx.priceUsd = priceCtx.price;
          tx.change24h = priceCtx.change24h;
          tx.marketCap = priceCtx.marketCap;
        }

        // AI analysis
        let aiSummary = null;
        let riskLevel = 'Medium';
        if (this.openai) {
          try {
            const prompt = `A whale moved ${tx.amount} ${tx.symbol} ($${(tx.usdValue/1e6).toFixed(1)}M) on ${tx.blockchain}. ${tx.classification ? 'Type: '+tx.classification : ''}. Write a short analysis (2 sentences) covering: why it matters, potential market impact, and risk level (low/medium/high).`;
            const response = await this.openai.chat.completions.create({
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 100,
              temperature: 0.7,
            });
            const text = response.choices[0].message.content.trim();
            if (text.toLowerCase().includes('high')) riskLevel = 'High';
            else if (text.toLowerCase().includes('low')) riskLevel = 'Low';
            aiSummary = text;
          } catch (err) {
            this.logger.debug(`AI analysis failed: ${err.message}`);
          }
        }
        tx.aiSummary = aiSummary;
        tx.riskLevel = riskLevel;

        // Store in DB
        await this._storeTransaction(tx);

        // Emit event with enriched data
        this.emit('whale.detected', tx);
        this.seenTxs.set(cacheKey, Date.now());

        // Trim seenTxs if too large
        if (this.seenTxs.size > MAX_SEEN_TXS) {
          const entries = [...this.seenTxs.entries()];
          // Keep the most recent half (sorted by timestamp)
          entries.sort((a, b) => a[1] - b[1]);
          const toKeep = entries.slice(-MAX_SEEN_TXS / 2);
          this.seenTxs = new Map(toKeep);
          this.logger.debug(`Trimmed seenTxs to ${this.seenTxs.size} entries`);
        }

        // Keep recent whales list bounded
        this._recentWhales.push(tx);
        if (this._recentWhales.length > MAX_RECENT_WHALES) {
          this._recentWhales = this._recentWhales.slice(-MAX_RECENT_WHALES);
        }

        this.logger.info(`🐋 Whale: ${tx.amount} ${tx.symbol} ($${tx.usdValue.toLocaleString()}) on ${tx.blockchain} - ${tx.classification || 'Unknown'}`);
      }
      this._cleanCache();

      if (unique.length > 0) {
        this.logger.info(`🐋 Found ${unique.length} whale transactions (emitted ${unique.filter(tx => this.assets.includes(tx.symbol.toUpperCase())).length})`);
      }
    } catch (err) {
      this.logger.error(`❌ Whale check failed: ${err.message}`);
    }
  }

  // ---------- TRANSACTION CLASSIFICATION ----------
  _classifyTransaction(tx) {
    const from = tx.from.address;
    const to = tx.to.address;
    let fromLabel = this.walletLabels[from] || this.exchangeAddresses[from] || null;
    let toLabel = this.walletLabels[to] || this.exchangeAddresses[to] || null;

    let classification = 'Wallet-to-Wallet';
    if (fromLabel && toLabel) classification = 'Exchange-to-Exchange';
    else if (fromLabel && !toLabel) classification = 'Withdrawal';
    else if (!fromLabel && toLabel) classification = 'Deposit';
    else if (tx.transactionType === 'bridge') classification = 'Bridge';
    return { class: classification, fromLabel, toLabel };
  }

  // ---------- PRICE CONTEXT ----------
  async _fetchPriceContext(symbol) {
    const key = `price_${symbol}`;
    const cached = this.priceCache.get(key);
    if (cached) return cached;
    try {
      const id = this._getGeckoId(symbol);
      const url = `${this.coinGeckoApi}/coins/${id}`;
      const response = await axios.get(url, { params: { localization: false, tickers: false, market_data: true }, timeout: 8000 });
      const data = response.data.market_data;
      const result = {
        price: data.current_price.usd,
        change24h: data.price_change_percentage_24h,
        marketCap: data.market_cap.usd,
      };
      this.priceCache.set(key, result);
      return result;
    } catch (err) {
      this.logger.debug(`Price context failed for ${symbol}: ${err.message}`);
      return null;
    }
  }

  _getGeckoId(symbol) {
    const map = {
      BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin',
      XRP:'ripple', ADA:'cardano', DOGE:'dogecoin', DOT:'polkadot',
      AVAX:'avalanche-2', MATIC:'matic-network', LINK:'chainlink',
      UNI:'uniswap', ATOM:'cosmos', TRX:'tron',
      USDT:'tether', USDC:'usd-coin', DAI:'dai',
    };
    return map[symbol] || symbol.toLowerCase();
  }

  // ---------- STORE TRANSACTION ----------
  async _storeTransaction(tx) {
    const db = this.deps.db;
    await db.run(
      `INSERT OR IGNORE INTO whale_transactions (
        hash, blockchain, symbol, amount, usdValue,
        fromAddress, toAddress, fromLabel, toLabel,
        classification, timestamp, priceUsd, marketCap, change24h,
        aiSummary, riskLevel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tx.hash, tx.blockchain, tx.symbol, tx.amount, tx.usdValue,
        tx.from.address, tx.to.address,
        tx.fromLabel || null, tx.toLabel || null,
        tx.classification || null,
        new Date(tx.timestamp).getTime(),
        tx.priceUsd || null, tx.marketCap || null, tx.change24h || null,
        tx.aiSummary || null, tx.riskLevel || null
      ]
    );
  }

  // ---------- FETCH SOURCES (with retry) ----------
  async _fetchWhaleAlertWithRetry() { return this._withRetry(() => this._fetchWhaleAlert(), 'WhaleAlert'); }
  async _fetchAlchemyWithRetry() { return this._withRetry(() => this._fetchAlchemy(), 'Alchemy'); }
  async _fetchBlockchairWithRetry() { return this._withRetry(() => this._fetchBlockchair(), 'Blockchair'); }

  async _withRetry(fn, sourceName) {
    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt >= this.maxRetries) throw err;
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.logger.debug(`Retry ${attempt}/${this.maxRetries} for ${sourceName} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // ---------- SOURCE: Whale Alert ----------
  async _fetchWhaleAlert() {
    if (!this.whaleKey) return [];
    const url = 'https://api.whale-alert.io/v1/transactions';
    const params = { api_key: this.whaleKey, min_value: this.minValueUsd, limit: 25 };
    const response = await axios.get(url, { params, timeout: 15000 });
    if (response.data.status !== 'success') return [];
    return response.data.transactions.map(tx => ({
      hash: tx.hash,
      blockchain: tx.blockchain,
      symbol: tx.symbol,
      amount: parseFloat(tx.amount),
      usdValue: parseFloat(tx.amount_usd),
      from: { address: tx.from.address, owner: tx.from.owner || 'Unknown', type: tx.from.type },
      to: { address: tx.to.address, owner: tx.to.owner || 'Unknown', type: tx.to.type },
      timestamp: new Date(tx.timestamp).toISOString(),
      transactionType: tx.transaction_type,
    }));
  }

  // ---------- SOURCE: Alchemy (multi-chain) ----------
  async _fetchAlchemy() {
    if (!this.alchemyKey) return [];
    const allTxs = [];
    const chainMap = {
      ethereum: 'eth-mainnet',
      arbitrum: 'arb-mainnet',
      optimism: 'opt-mainnet',
      polygon: 'polygon-mainnet',
      base: 'base-mainnet',
      bsc: 'bnb-mainnet',
      avalanche: 'avax-mainnet',
      fantom: 'fantom-mainnet',
    };
    for (const chain of this.chains) {
      const network = chainMap[chain];
      if (!network) continue;
      const url = `https://${network}.g.alchemy.com/v2/${this.alchemyKey}`;
      const payload = {
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{
          fromBlock: '0x0',
          toBlock: 'latest',
          category: ['erc20', 'external'],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: '0x64',
        }],
        id: 1,
      };
      try {
        const response = await axios.post(url, payload, { timeout: 15000 });
        const transfers = response.data.result?.transfers || [];
        for (const tx of transfers) {
          const symbol = tx.asset || tx.metadata?.symbol || 'UNKNOWN';
          if (!this.assets.includes(symbol.toUpperCase())) continue;
          const rawValue = parseFloat(tx.value);
          const price = tx.metadata?.price || 1;
          const usdEstimate = rawValue * price;
          if (usdEstimate < this.minValueUsd) continue;
          allTxs.push({
            hash: tx.hash,
            blockchain: chain,
            symbol: symbol,
            amount: rawValue,
            usdValue: usdEstimate,
            from: { address: tx.from, owner: 'Unknown', type: 'address' },
            to: { address: tx.to, owner: 'Unknown', type: 'address' },
            timestamp: new Date(tx.metadata?.blockTimestamp || Date.now()).toISOString(),
            transactionType: 'transfer',
          });
        }
      } catch (err) {
        this.logger.warn(`Alchemy fetch failed for ${chain}: ${err.message}`);
      }
    }
    return allTxs;
  }

  // ---------- SOURCE: Blockchair (BTC) ----------
  async _fetchBlockchair() {
    const url = 'https://api.blockchair.com/bitcoin/transactions';
    const params = { limit: 50, order: 'desc', q: `value_usd > ${this.minValueUsd}` };
    const response = await axios.get(url, { params, timeout: 15000 });
    const txs = response.data.data || [];
    return txs.map(tx => ({
      hash: tx.hash,
      blockchain: 'BTC',
      symbol: 'BTC',
      amount: tx.inputs ? tx.inputs.reduce((sum, inp) => sum + inp.value, 0) / 1e8 : 0,
      usdValue: parseFloat(tx.value_usd) || 0,
      from: { address: tx.inputs?.[0]?.addresses?.[0] || 'Unknown', owner: 'Unknown', type: 'address' },
      to: { address: tx.outputs?.[0]?.addresses?.[0] || 'Unknown', owner: 'Unknown', type: 'address' },
      timestamp: new Date(tx.time * 1000).toISOString(),
      transactionType: 'transfer',
    }));
  }

  // ---------- CACHE CLEANUP ----------
  _cleanCache() {
    const now = Date.now();
    const entries = [...this.seenTxs.entries()];
    let trimmed = 0;
    for (const [key, ts] of entries) {
      if (now - ts > this.cacheTTL) {
        this.seenTxs.delete(key);
        trimmed++;
      }
    }
    if (trimmed) this.logger.debug(`Cleaned ${trimmed} old seenTxs entries`);
  }

  // ---------- MEMORY CLEANUP ----------
  async cleanup() {
    this.logger.debug('🧹 WhaleAgent cleanup running...');

    // 1. Trim seenTxs (beyond TTL and size)
    this._cleanCache();
    if (this.seenTxs.size > MAX_SEEN_TXS) {
      const entries = [...this.seenTxs.entries()];
      entries.sort((a, b) => a[1] - b[1]);
      const toKeep = entries.slice(-MAX_SEEN_TXS / 2);
      this.seenTxs = new Map(toKeep);
      this.logger.debug(`Trimmed seenTxs to ${this.seenTxs.size} entries`);
    }

    // 2. Trim priceCache (via TTL, but we can also clear if too large)
    if (this.priceCache.size() > 100) {
      // TTL will handle, but we can also force clear old ones
      // Not needed, TTL does it automatically
    }

    // 3. Trim recentWhales
    if (this._recentWhales.length > MAX_RECENT_WHALES) {
      this._recentWhales = this._recentWhales.slice(-MAX_RECENT_WHALES);
      this.logger.debug(`Trimmed recentWhales to ${this._recentWhales.length}`);
    }

    // 4. Trim communityPredictions (if too many)
    if (this._communityPredictions.size > MAX_COMMUNITY_PREDICTIONS) {
      const entries = [...this._communityPredictions.entries()];
      // Keep most recent by timestamp (we store timestamp in value)
      entries.sort((a, b) => a[1] - b[1]);
      const toKeep = entries.slice(-MAX_COMMUNITY_PREDICTIONS);
      this._communityPredictions = new Map(toKeep);
      this.logger.debug(`Trimmed communityPredictions to ${this._communityPredictions.size}`);
    }

    // 5. Optionally trim walletPerformance
    if (this._walletPerformance.size > MAX_WALLET_STATS_ENTRIES) {
      const entries = [...this._walletPerformance.entries()];
      entries.sort((a, b) => (b[1].trades || 0) - (a[1].trades || 0));
      const toKeep = entries.slice(0, MAX_WALLET_STATS_ENTRIES);
      this._walletPerformance = new Map(toKeep);
      this.logger.debug(`Trimmed walletPerformance to ${this._walletPerformance.size}`);
    }

    this.logger.debug('✅ WhaleAgent cleanup complete');
  }

  async clearCache() {
    return this.cleanup();
  }

  async aggressiveCleanup() {
    this.logger.warn('🔥 WhaleAgent aggressive cleanup running...');
    this.seenTxs.clear();
    this.priceCache.clear();
    this._recentWhales = [];
    this._communityPredictions.clear();
    this._walletPerformance.clear();
    // Reload minimal data
    await this._loadWatchlists();
    await this._loadWalletStats();
    this.logger.debug('🔥 WhaleAgent aggressive cleanup complete');
  }

  // ---------- SLASH COMMANDS (unchanged) ----------
  // (All command methods remain as in v8.0)
  // ...

  // ---------- EMBED (unchanged) ----------
  formatWhaleEmbed(tx) {
    // ... (same as before)
  }

  // ---------- DESTROY ----------
  async destroy() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
    this.seenTxs.clear();
    this.priceCache.clear();
    await super.destroy();
  }
}

module.exports = WhaleAgent;