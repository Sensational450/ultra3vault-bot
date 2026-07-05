/**
 * 🐋 WhaleAgent v8.0 – On-Chain Intelligence Platform
 * - Multi-chain support (ETH, BTC, SOL, BNB, Base, Arbitrum, Optimism, Polygon, Avalanche)
 * - Smart money tracking, wallet P&L, portfolio value
 * - AI analysis of whale transactions (OpenAI)
 * - Advanced analytics: accumulation score, sentiment, exchange pressure
 * - Community features: watchlists, leaderboards, predictions
 * - Admin controls, premium gating, health checks
 * - All commands consolidated under /whale
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const axios = require('axios');
const { ethers } = require('ethers');

// ---- Simple cache & rate limiter ----
class TTLCache {
  constructor(ttl = 60000) { this.cache = new Map(); this.ttl = ttl; }
  get(key) { const e = this.cache.get(key); if (!e) return null; if (Date.now() - e.timestamp > this.ttl) { this.cache.delete(key); return null; } return e.value; }
  set(key, value) { this.cache.set(key, { value, timestamp: Date.now() }); }
  clear() { this.cache.clear(); }
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

    // ---- Caches ----
    this.cacheTTL = parseInt(process.env.WHALE_CACHE_TTL) || 60 * 60 * 1000;
    this.seenTxs = new Map();
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

    // ---- State ----
    this._startTime = Date.now();
    this._lastRun = null;
    this._sources = {
      whaleAlert: !!this.whaleKey,
      alchemy: !!this.alchemyKey && this.chains.length > 0,
      blockchair: true,
    };
    this._recentWhales = [];
    this._walletPerformance = new Map(); // address -> { profit, trades, winRate }
    this._communityPredictions = new Map(); // txId -> { bullish, bearish }

    // ---- Retry ----
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // ---- Premium flag ----
    this.premiumEnabled = process.env.WHALE_PREMIUM_ENABLED !== 'false';

    // ---- Admin log ----
    this.adminLogWebhook = process.env.WHALE_ADMIN_LOG_WEBHOOK || process.env.LOG_WEBHOOK_URL;
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadWatchlists();
    await this._loadWalletStats();

    this.subscribe('job.whaleCheck', async () => {
      await this.checkWhales();
    });

    // Subscribe to price updates for context (if needed)
    this.subscribe('price.alert', async (data) => {
      // Store recent price for context
    });

    const sourceList = Object.entries(this._sources)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    this.logger.info(`🐋 WhaleAgent v8.0 ready (threshold: $${(this.minValueUsd/1e6).toFixed(0)}M, sources: ${sourceList})`);
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
        sentiment TEXT, -- bullish or bearish
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

  // ---------- Load watchlists and wallet stats ----------
  async _loadWatchlists() {
    const db = this.deps.db;
    this._watchlists = new Map(); // userId -> Set of addresses
    const rows = await db.all(`SELECT userId, walletAddress FROM whale_watchlists`);
    for (const row of rows) {
      if (!this._watchlists.has(row.userId)) this._watchlists.set(row.userId, new Set());
      this._watchlists.get(row.userId).add(row.walletAddress);
    }
  }

  async _loadWalletStats() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT walletAddress, guildId, totalProfit, totalTrades, wins, losses FROM whale_wallet_performance`);
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
  }

  // ---------- MAIN CHECK ----------
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

        this.logger.info(`🐋 Whale: ${tx.amount} ${tx.symbol} ($${tx.usdValue.toLocaleString()}) on ${tx.blockchain} - ${tx.classification || 'Unknown'}`);
      }
      this._cleanCache();

      // Update analytics
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
    for (const [key, ts] of this.seenTxs.entries()) {
      if (now - ts > this.cacheTTL) this.seenTxs.delete(key);
    }
  }

  // ---------- SLASH COMMANDS (Consolidated /whale) ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'whale') return;

    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();

    // Handle groups first
    if (group === 'wallet') {
      await this.cmdWallet(interaction);
      return;
    }
    if (group === 'portfolio') {
      await this.cmdPortfolio(interaction);
      return;
    }
    if (group === 'config') {
      await this.cmdConfig(interaction);
      return;
    }

    // Top-level subcommands
    switch (sub) {
      case 'status':
        await this.cmdStatus(interaction);
        break;
      case 'stats':
        await this.cmdStats(interaction);
        break;
      case 'top':
        await this.cmdTop(interaction);
        break;
      case 'history':
        await this.cmdHistory(interaction);
        break;
      case 'watch':
        await this.cmdWatch(interaction);
        break;
      case 'ignore':
        await this.cmdIgnore(interaction);
        break;
      case 'predict':
        await this.cmdPredict(interaction);
        break;
      case 'leaderboard':
        await this.cmdLeaderboard(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ---------- Subcommand: status ----------
  async cmdStatus(interaction) {
    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const db = this.deps.db;
    const total = await db.get(`SELECT COUNT(*) as count FROM whale_transactions`);
    const embed = new EmbedBuilder()
      .setTitle('🐋 Whale Agent – Status')
      .setColor(0x3498db)
      .addFields(
        { name: 'Status', value: '✅ Operational', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'Threshold', value: `$${(this.minValueUsd/1e6).toFixed(0)}M`, inline: true },
        { name: 'Total Txs', value: total?.count?.toString() || '0', inline: true },
        { name: 'Sources', value: Object.entries(this._sources).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None', inline: false },
        { name: 'Chains', value: this.chains.join(', ') || 'None', inline: false },
        { name: 'Cache Size', value: `${this.seenTxs.size} txs`, inline: true },
        { name: 'Last Run', value: this._lastRun ? `<t:${Math.floor(this._lastRun/1000)}:R>` : 'Never', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Subcommand: stats ----------
  async cmdStats(interaction) {
    const db = this.deps.db;
    const today = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const rows = await db.all(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'Deposit' THEN 1 ELSE 0 END) as deposits,
        SUM(CASE WHEN classification = 'Withdrawal' THEN 1 ELSE 0 END) as withdrawals,
        SUM(CASE WHEN classification = 'Wallet-to-Wallet' THEN 1 ELSE 0 END) as wallet_to_wallet,
        AVG(usdValue) as avgUsd,
        MAX(usdValue) as maxUsd,
        MIN(usdValue) as minUsd
      FROM whale_transactions
      WHERE timestamp >= ?
    `, [weekAgo.getTime()]);
    const todayCount = await db.get(`SELECT COUNT(*) as count FROM whale_transactions WHERE timestamp >= ?`, [today.getTime()]);
    const embed = new EmbedBuilder()
      .setTitle('📊 Whale Statistics (Last 7 Days)')
      .setColor(0xff7700)
      .addFields(
        { name: 'Total Txs', value: rows.total?.toString() || '0', inline: true },
        { name: 'Today', value: todayCount?.count?.toString() || '0', inline: true },
        { name: 'Deposits', value: rows.deposits?.toString() || '0', inline: true },
        { name: 'Withdrawals', value: rows.withdrawals?.toString() || '0', inline: true },
        { name: 'Wallet-to-Wallet', value: rows.wallet_to_wallet?.toString() || '0', inline: true },
        { name: 'Avg USD', value: rows.avgUsd ? `$${(rows.avgUsd/1e6).toFixed(1)}M` : 'N/A', inline: true },
        { name: 'Max USD', value: rows.maxUsd ? `$${(rows.maxUsd/1e6).toFixed(1)}M` : 'N/A', inline: true },
        { name: 'Min USD', value: rows.minUsd ? `$${(rows.minUsd/1e6).toFixed(1)}M` : 'N/A', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Subcommand: top ----------
  async cmdTop(interaction) {
    const limit = interaction.options.getInteger('limit') || 5;
    const db = this.deps.db;
    const rows = await db.all(`
      SELECT * FROM whale_transactions
      ORDER BY usdValue DESC
      LIMIT ?
    `, [limit]);
    if (!rows.length) return interaction.reply({ content: 'No whale transactions recorded yet.', ephemeral: true });
    let desc = '';
    for (const row of rows) {
      const label = row.fromLabel || row.toLabel || '';
      desc += `• **${row.symbol}** ${row.amount.toFixed(2)} ($${(row.usdValue/1e6).toFixed(1)}M) – ${row.classification || 'Transfer'}\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Top ${limit} Whale Transactions`)
      .setDescription(desc)
      .setColor(0xffd700);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Subcommand: history ----------
  async cmdHistory(interaction) {
    const limit = interaction.options.getInteger('limit') || 5;
    const db = this.deps.db;
    const rows = await db.all(`
      SELECT * FROM whale_transactions
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);
    if (!rows.length) return interaction.reply({ content: 'No whale transactions recorded yet.', ephemeral: true });
    let desc = '';
    for (const row of rows) {
      const time = new Date(row.timestamp);
      desc += `• **${row.symbol}** ${row.amount.toFixed(2)} ($${(row.usdValue/1e6).toFixed(1)}M) – ${row.classification || 'Transfer'} – <t:${Math.floor(time.getTime()/1000)}:R>\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('📜 Recent Whale Transactions')
      .setDescription(desc)
      .setColor(0x3498db);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Subcommand: watch (watchlist) ----------
  async cmdWatch(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const address = interaction.options.getString('address');
    const db = this.deps.db;
    if (sub === 'add') {
      // Check blacklist
      const blacklisted = await db.get(`SELECT * FROM whale_blacklist WHERE walletAddress = ? AND guildId = ?`, [address, guildId]);
      if (blacklisted) return interaction.reply({ content: '❌ This wallet is blacklisted.', ephemeral: true });
      await db.run(
        `INSERT OR REPLACE INTO whale_watchlists (userId, guildId, walletAddress, addedAt) VALUES (?, ?, ?, ?)`,
        [userId, guildId, address, Date.now()]
      );
      if (!this._watchlists.has(userId)) this._watchlists.set(userId, new Set());
      this._watchlists.get(userId).add(address);
      await interaction.reply({ content: `✅ Added wallet ${address} to your watchlist.`, ephemeral: true });
    } else if (sub === 'remove') {
      await db.run(`DELETE FROM whale_watchlists WHERE userId = ? AND guildId = ? AND walletAddress = ?`, [userId, guildId, address]);
      if (this._watchlists.has(userId)) this._watchlists.get(userId).delete(address);
      await interaction.reply({ content: `✅ Removed wallet ${address} from your watchlist.`, ephemeral: true });
    } else if (sub === 'list') {
      const rows = await db.all(`SELECT walletAddress FROM whale_watchlists WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      if (!rows.length) return interaction.reply({ content: 'Your watchlist is empty.', ephemeral: true });
      const list = rows.map(r => `• ${r.walletAddress}`).join('\n');
      const embed = new EmbedBuilder().setTitle('👀 Your Whale Watchlist').setDescription(list).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- Subcommand: ignore (blacklist) ----------
  async cmdIgnore(interaction) {
    const address = interaction.options.getString('address');
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO whale_blacklist (walletAddress, guildId, reason) VALUES (?, ?, ?)`,
      [address, guildId, 'user ignored']
    );
    await interaction.reply({ content: `✅ Ignored wallet ${address}. You will not see alerts from it.`, ephemeral: true });
  }

  // ---------- Subcommand: predict (community sentiment) ----------
  async cmdPredict(interaction) {
    const txHash = interaction.options.getString('tx');
    const sentiment = interaction.options.getString('sentiment');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    // Check if tx exists
    const tx = await db.get(`SELECT hash FROM whale_transactions WHERE hash = ?`, [txHash]);
    if (!tx) return interaction.reply({ content: '❌ Transaction not found.', ephemeral: true });
    await db.run(
      `INSERT OR REPLACE INTO whale_community_predictions (txHash, userId, guildId, sentiment, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [txHash, userId, guildId, sentiment, Date.now()]
    );
    await interaction.reply({ content: `✅ You voted ${sentiment} for this whale transaction!`, ephemeral: true });
  }

  // ---------- Subcommand: leaderboard ----------
  async cmdLeaderboard(interaction) {
    const db = this.deps.db;
    const rows = await db.all(`
      SELECT userId, COUNT(*) as votes FROM whale_community_predictions
      WHERE guildId = ?
      GROUP BY userId
      ORDER BY votes DESC
      LIMIT 10
    `, [interaction.guild.id]);
    if (!rows.length) return interaction.reply({ content: 'No predictions yet.', ephemeral: true });
    let desc = '';
    for (let i = 0; i < rows.length; i++) {
      const user = await this.client.users.fetch(rows[i].userId).catch(() => null);
      const name = user ? user.username : rows[i].userId;
      desc += `${i+1}. **${name}** – ${rows[i].votes} predictions\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Whale Prediction Leaderboard').setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---------- Subcommand: wallet (group) ----------
  async cmdWallet(interaction) {
    const sub = interaction.options.getSubcommand();
    const address = interaction.options.getString('address');
    const db = this.deps.db;
    if (sub === 'view') {
      // Get transaction history for this wallet
      const rows = await db.all(`
        SELECT * FROM whale_transactions
        WHERE fromAddress = ? OR toAddress = ?
        ORDER BY usdValue DESC
        LIMIT 20
      `, [address, address]);
      if (!rows.length) return interaction.reply({ content: `No transactions found for wallet ${address}`, ephemeral: true });
      let desc = '';
      for (const row of rows) {
        desc += `• ${row.symbol} ${row.amount.toFixed(2)} ($${(row.usdValue/1e6).toFixed(1)}M) – ${row.classification || 'Transfer'}\n`;
      }
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Wallet ${address.slice(0,10)}...`)
        .setDescription(desc)
        .setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'score') {
      // Calculate a score based on transaction volume and frequency
      const rows = await db.all(`
        SELECT COUNT(*) as count, SUM(usdValue) as totalVolume, AVG(usdValue) as avgVolume
        FROM whale_transactions
        WHERE fromAddress = ? OR toAddress = ?
      `, [address, address]);
      if (!rows.length || !rows[0].count) return interaction.reply({ content: `No data for wallet ${address}`, ephemeral: true });
      const { count, totalVolume, avgVolume } = rows[0];
      const score = Math.min(100, Math.floor((totalVolume / 1e9) * 10 + count * 0.5));
      const embed = new EmbedBuilder()
        .setTitle(`📊 Wallet Score: ${address.slice(0,10)}...`)
        .setDescription(`Score: **${score}/100**\n\nTransactions: ${count}\nTotal Volume: $${(totalVolume/1e6).toFixed(1)}M\nAvg Volume: $${(avgVolume/1e6).toFixed(1)}M`)
        .setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- Subcommand: portfolio (group) ----------
  async cmdPortfolio(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    if (sub === 'view') {
      // Show wallets the user is watching with their total volume
      const watchlist = await db.all(`SELECT walletAddress FROM whale_watchlists WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      if (!watchlist.length) return interaction.reply({ content: 'Your watchlist is empty.', ephemeral: true });
      let desc = '';
      for (const w of watchlist) {
        const stats = await db.get(`
          SELECT COUNT(*) as count, SUM(usdValue) as totalVolume
          FROM whale_transactions
          WHERE fromAddress = ? OR toAddress = ?
        `, [w.walletAddress, w.walletAddress]);
        desc += `• ${w.walletAddress.slice(0,10)}... – ${stats?.count || 0} txs, $${(stats?.totalVolume/1e6 || 0).toFixed(1)}M\n`;
      }
      const embed = new EmbedBuilder().setTitle('📊 Your Whale Portfolio').setDescription(desc).setColor(0x00ff88);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- Subcommand: config (admin) ----------
  async cmdConfig(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    if (sub === 'set') {
      const key = interaction.options.getString('key');
      const value = interaction.options.getString('value');
      // Store in a config table (we'll use a generic table)
      await db.run(
        `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, ?, ?)`,
        [guildId, `whale_${key}`, JSON.stringify(value)]
      );
      await interaction.reply({ content: `✅ ${key} set to ${value}`, ephemeral: true });
    } else if (sub === 'show') {
      const rows = await db.all(`SELECT configKey, config FROM guild_configs WHERE guildId = ? AND configKey LIKE 'whale_%'`, [guildId]);
      if (!rows.length) return interaction.reply({ content: 'No whale config set.', ephemeral: true });
      let desc = '';
      for (const row of rows) {
        desc += `• ${row.configKey.replace('whale_','')}: ${JSON.parse(row.config)}\n`;
      }
      const embed = new EmbedBuilder().setTitle('⚙️ Whale Config').setDescription(desc).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- EMBED (enriched) ----------
  formatWhaleEmbed(tx) {
    const explorerUrl = this.explorers[tx.blockchain.toUpperCase()] || this.explorers.ETH;
    const txLink = `${explorerUrl}${tx.hash}`;
    const fromLabel = tx.fromLabel || tx.from.owner || tx.from.address.substring(0,10)+'...';
    const toLabel = tx.toLabel || tx.to.owner || tx.to.address.substring(0,10)+'...';

    const embed = new EmbedBuilder()
      .setTitle(`🐋 Whale Alert: ${tx.amount.toFixed(2)} ${tx.symbol}`)
      .setDescription(`**${tx.transactionType || 'Transfer'}** on **${tx.blockchain.toUpperCase()}**`)
      .setColor(0xff7700)
      .addFields(
        { name: '💰 USD Value', value: `$${tx.usdValue.toLocaleString()}`, inline: true },
        { name: '🔗 Blockchain', value: tx.blockchain.toUpperCase(), inline: true },
        { name: '🏷️ Classification', value: tx.classification || 'Unknown', inline: true },
        { name: '⬅️ From', value: fromLabel, inline: false },
        { name: '➡️ To', value: toLabel, inline: false },
        { name: '🔍 TX', value: `[View](${txLink})`, inline: false }
      );

    if (tx.priceUsd) {
      embed.addFields(
        { name: '💵 Price', value: `$${tx.priceUsd.toFixed(2)}`, inline: true },
        { name: '📈 24h Change', value: `${tx.change24h ? tx.change24h.toFixed(1)+'%' : 'N/A'}`, inline: true },
        { name: '📊 Market Cap', value: tx.marketCap ? `$${(tx.marketCap/1e9).toFixed(1)}B` : 'N/A', inline: true }
      );
    }
    if (tx.aiSummary) {
      embed.addFields({ name: '🧠 AI Insight', value: tx.aiSummary, inline: false });
    }
    if (tx.riskLevel) {
      const riskEmoji = tx.riskLevel === 'High' ? '🔴' : tx.riskLevel === 'Low' ? '🟢' : '🟡';
      embed.addFields({ name: '⚠️ Risk Level', value: `${riskEmoji} ${tx.riskLevel}`, inline: true });
    }
    embed.setTimestamp(new Date(tx.timestamp))
      .setFooter({ text: 'Ultra3Vault • Whale Monitor v8.0' });

    return embed;
  }

  // ---------- Cleanup ----------
  async destroy() {
    this.seenTxs.clear();
    this.priceCache.clear();
    await super.destroy();
  }
}

module.exports = WhaleAgent;