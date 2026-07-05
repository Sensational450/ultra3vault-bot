/**
 * 📈 SignalAgent v8.1 – Single /signal Command (Subcommands)
 * - Multiple take‑profit targets (TP1, TP2, TP3)
 * - Risk‑to‑reward ratio
 * - Fear & Greed Index
 * - AI trading plan + market outlook
 * - Top gainers / losers (24h)
 * - Signal expiry timer
 * - Premium cooldown (30 min)
 * - More trading pairs for premium users
 * - Leaderboard & achievements
 * - Signal quality grade (A+, A, B, C)
 * - All subcommands under /signal
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

// ----- Caches & Rate Limiters -----
class TTLCache {
  constructor(ttl = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }
  clear() {
    this.cache.clear();
  }
}

class SimpleRateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = [];
  }
  check() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.limit) {
      const oldest = this.requests[0];
      const resetIn = this.windowMs - (now - oldest);
      return { allowed: false, resetIn };
    }
    this.requests.push(now);
    return { allowed: true };
  }
}

// ----- Signal Quality Grading -----
function gradeSignal(confidence, indicators, rsi) {
  let grade = 'C';
  if (confidence >= 85 && indicators >= 4) grade = 'A+';
  else if (confidence >= 80 && indicators >= 3) grade = 'A';
  else if (confidence >= 70 && indicators >= 2) grade = 'B';
  else grade = 'C';
  return grade;
}

class SignalAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config from Environment ----
    this.coins = (process.env.SIGNAL_COINS || 'BTC,ETH,SOL,BNB,XRP,ADA')
      .split(',').map(c => c.trim().toUpperCase());

    this.premiumCoins = (process.env.SIGNAL_PREMIUM_COINS || 'BTC,ETH,SOL,ARB,OP,MATIC')
      .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

    this.minConfidence = parseFloat(process.env.SIGNAL_MIN_CONFIDENCE) || 60;
    this.whaleWindow = parseInt(process.env.SIGNAL_WHALE_WINDOW_MS) || 10 * 60 * 1000;
    this.whaleCorrelationThreshold = parseFloat(process.env.SIGNAL_WHALE_CORRELATION_VALUE) || 2_000_000;
    this.whaleImmediateThreshold = parseFloat(process.env.SIGNAL_WHALE_IMMEDIATE_VALUE) || 5_000_000;
    this.rsiOversold = parseFloat(process.env.SIGNAL_RSI_OVERSOLD) || 30;
    this.rsiOverbought = parseFloat(process.env.SIGNAL_RSI_OVERBOUGHT) || 70;
    this.smaBreakoutPct = parseFloat(process.env.SIGNAL_SMA_BREAKOUT_PCT) || 0.03;
    this.min24hChange = parseFloat(process.env.SIGNAL_MIN_24H_CHANGE) || 5;
    this.historyLimit = parseInt(process.env.SIGNAL_HISTORY_LIMIT) || 50;
    this.bollingerStdDev = parseFloat(process.env.SIGNAL_BOLLINGER_STD_DEV) || 2;
    this.volumeThreshold = parseFloat(process.env.SIGNAL_VOLUME_THRESHOLD) || 1.5;

    // ---- Premium cooldown ----
    this.freeCooldownMs = 60 * 60 * 1000;      // 1 hour
    this.premiumCooldownMs = 30 * 60 * 1000;   // 30 minutes

    // ---- API ----
    this.coinGeckoApi = 'https://api.coingecko.com/api/v3';
    this.priceCache = new TTLCache(60000);
    this.rateLimiter = new SimpleRateLimiter(30, 60000);

    // ---- Fear & Greed ----
    this.fearGreedCache = null;
    this.fearGreedTimestamp = 0;
    this.fearGreedTTL = 60 * 60 * 1000; // 1 hour

    // ---- OpenAI ----
    this.openai = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI available for SignalAgent');
      }
    } catch (err) {
      this.logger.warn('OpenAI not available – reasons will be simple.');
    }

    // ---- Tracking ----
    this.priceHistory = new Map();
    this.lastSignal = new Map();
    this.recentWhales = [];
    this._startTime = Date.now();
    this._subscriptionCache = new Map();

    // ---- Leaderboard ----
    this.leaderboard = new Map(); // userId -> { points, signals, wins, losses }
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadPerformance();
    await this._loadLeaderboard();

    this.subscribe('job.signalCheck', async () => {
      await this.generateSignals();
    });

    this.subscribe('whale.detected', async (tx) => {
      await this.handleWhaleEvent(tx);
    });

    this.subscribe('news.summarized', async (data) => {
      await this.handleNewsEvent(data);
    });

    this.logger.info(`📈 SignalAgent v8.1 ready (coins: ${this.coins.join(', ')}, premium: ${this.premiumCoins.join(', ')})`);
  }

  // ---------- DATABASE ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS signal_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coin TEXT,
        action TEXT,
        entryPrice REAL,
        targetPrices TEXT,
        stopLoss REAL,
        outcome TEXT,
        roi REAL,
        generatedAt INTEGER,
        checkedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS signal_leaderboard (
        userId TEXT,
        guildId TEXT,
        points INTEGER DEFAULT 0,
        signals INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS signal_achievements (
        userId TEXT,
        guildId TEXT,
        achievement TEXT,
        unlockedAt INTEGER,
        PRIMARY KEY (userId, guildId, achievement)
      );
      CREATE TABLE IF NOT EXISTS signal_portfolio (
        userId TEXT,
        guildId TEXT,
        coin TEXT,
        shares REAL,
        avgPrice REAL,
        PRIMARY KEY (userId, guildId, coin)
      );
      CREATE TABLE IF NOT EXISTS user_signal_prefs (
        userId TEXT,
        guildId TEXT,
        watchCoins TEXT,
        dmEnabled BOOLEAN DEFAULT 1,
        PRIMARY KEY (userId, guildId)
      );
    `);
  }

  async _loadPerformance() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT outcome, roi FROM signal_performance WHERE outcome != 'pending'`);
    let wins = 0, losses = 0, roiSum = 0;
    for (const row of rows) {
      if (row.outcome === 'win') wins++;
      else losses++;
      roiSum += row.roi || 0;
    }
    this.performance = { total: wins + losses, wins, losses, roiSum };
  }

  async _loadLeaderboard() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT userId, guildId, points FROM signal_leaderboard`);
    for (const row of rows) {
      this.leaderboard.set(`${row.userId}_${row.guildId}`, {
        points: row.points,
        signals: 0,
        wins: 0,
        losses: 0,
      });
    }
  }

  async _updateLeaderboard(userId, guildId, outcome) {
    const key = `${userId}_${guildId}`;
    if (!this.leaderboard.has(key)) {
      this.leaderboard.set(key, { points: 0, signals: 0, wins: 0, losses: 0 });
    }
    const entry = this.leaderboard.get(key);
    entry.signals++;
    if (outcome === 'win') { entry.wins++; entry.points += 10; }
    else if (outcome === 'loss') { entry.losses++; entry.points -= 5; }
    else { entry.points += 2; } // neutral
    entry.points = Math.max(0, entry.points);
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO signal_leaderboard (userId, guildId, points, signals, wins, losses)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, guildId, entry.points, entry.signals, entry.wins, entry.losses]
    );
    // Check achievements
    if (entry.wins >= 10) await this._unlockAchievement(userId, guildId, '10_win_streak');
    if (entry.signals >= 50) await this._unlockAchievement(userId, guildId, '50_signals');
  }

  async _unlockAchievement(userId, guildId, achievement) {
    const db = this.deps.db;
    const existing = await db.get(`SELECT * FROM signal_achievements WHERE userId = ? AND guildId = ? AND achievement = ?`, [userId, guildId, achievement]);
    if (!existing) {
      await db.run(`INSERT INTO signal_achievements (userId, guildId, achievement, unlockedAt) VALUES (?, ?, ?, ?)`, [userId, guildId, achievement, Date.now()]);
    }
  }

  // ---------- SUBSCRIPTION CHECK ----------
  async _getUserTier(userId, guildId) {
    if (this._subscriptionCache.has(userId)) return this._subscriptionCache.get(userId);
    if (!this.models?.Subscription) return null;
    const sub = await this.models.Subscription.get(userId, guildId);
    const tier = sub && sub.expiresAt > Date.now() ? sub.tier : null;
    this._subscriptionCache.set(userId, tier);
    setTimeout(() => this._subscriptionCache.delete(userId), 5 * 60 * 1000);
    return tier;
  }

  // ---------- GET COIN LIST FOR USER ----------
  async _getCoinsForUser(userId, guildId) {
    const tier = await this._getUserTier(userId, guildId);
    if (tier === 'premium' || tier === 'vip') {
      return [...new Set([...this.coins, ...this.premiumCoins])];
    }
    return this.coins;
  }

  // ---------- FEAR & GREED ----------
  async _getFearGreed() {
    const now = Date.now();
    if (this.fearGreedCache && now - this.fearGreedTimestamp < this.fearGreedTTL) {
      return this.fearGreedCache;
    }
    try {
      const response = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
      const data = response.data.data?.[0];
      if (data) {
        this.fearGreedCache = {
          value: parseInt(data.value),
          classification: data.value_classification,
          timestamp: data.timestamp,
        };
        this.fearGreedTimestamp = now;
        return this.fearGreedCache;
      }
    } catch (err) {
      this.logger.debug(`Fear & Greed fetch failed: ${err.message}`);
    }
    return null;
  }

  // ---------- TOP GAINERS / LOSERS ----------
  async _getTopGainersLosers(limit = 5) {
    try {
      const url = `${this.coinGeckoApi}/coins/markets`;
      const params = {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h',
      };
      const response = await axios.get(url, { params, timeout: 10000 });
      const coins = response.data;
      const sorted = coins.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
      const gainers = sorted.slice(0, limit).map(c => ({ symbol: c.symbol.toUpperCase(), change: c.price_change_percentage_24h }));
      const losers = sorted.slice(-limit).reverse().map(c => ({ symbol: c.symbol.toUpperCase(), change: c.price_change_percentage_24h }));
      return { gainers, losers };
    } catch (err) {
      this.logger.debug(`Top gainers/losers fetch failed: ${err.message}`);
      return null;
    }
  }

  // ---------- GENERATE SIGNALS ----------
  async generateSignals() {
    const allCoins = [...new Set([...this.coins, ...this.premiumCoins])];
    for (const coin of allCoins) {
      try {
        const signal = await this._generateForCoin(coin);
        if (signal && signal.confidence >= this.minConfidence) {
          const key = `${coin}_${signal.action}`;
          // Global cooldown (for public channel) – but we'll handle premium later via separate channel
          if (this.lastSignal.has(key) && Date.now() - this.lastSignal.get(key) < this.freeCooldownMs) continue;
          this.lastSignal.set(key, Date.now());

          // Store signal in DB
          const signalId = await this._storeSignal(signal);

          // Emit signal
          this.emit('signal.generated', signal);

          // Schedule performance check
          this._schedulePerformanceCheck(signalId, signal.coin, signal.action, signal.priceUsd, 1);
          this._schedulePerformanceCheck(signalId, signal.coin, signal.action, signal.priceUsd, 4);
          this._schedulePerformanceCheck(signalId, signal.coin, signal.action, signal.priceUsd, 24);

          this.logger.info(`📈 Signal: ${signal.coin} ${signal.action} (${signal.confidence}%)`);
        }
      } catch (err) {
        this.logger.debug(`Signal failed for ${coin}: ${err.message}`);
      }
    }
  }

  async _storeSignal(signal) {
    const db = this.deps.db;
    const targetPrices = [signal.tp1, signal.tp2, signal.tp3].filter(v => v !== null && v !== undefined);
    const result = await db.run(
      `INSERT INTO signal_performance (coin, action, entryPrice, targetPrices, stopLoss, outcome, generatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [signal.coin, signal.action, signal.priceUsd, JSON.stringify(targetPrices), signal.stopLoss, 'pending', Date.now()]
    );
    return result.lastID;
  }

  _schedulePerformanceCheck(signalId, coin, action, entryPrice, hours) {
    const delay = hours * 60 * 60 * 1000;
    setTimeout(async () => {
      await this._checkSignalPerformance({ signalId, coin, action, entryPrice, hours });
    }, delay);
  }

  async _checkSignalPerformance(data) {
    const { signalId, coin, action, entryPrice, hours } = data;
    try {
      const priceData = await this._fetchPriceDataWithRetry(coin);
      if (!priceData) return;
      const currentPrice = priceData.currentPrice;
      const change = (currentPrice - entryPrice) / entryPrice;
      const roi = action === 'BUY' ? change : -change;
      const outcome = roi > 0.01 ? 'win' : roi < -0.01 ? 'loss' : 'neutral';
      const db = this.deps.db;
      await db.run(
        `UPDATE signal_performance SET outcome = ?, roi = ?, checkedAt = ? WHERE id = ?`,
        [outcome, roi, Date.now(), signalId]
      );
      if (outcome === 'win') this.performance.wins++;
      else if (outcome === 'loss') this.performance.losses++;
      this.performance.total++;
      this.performance.roiSum += roi;
    } catch (err) {
      this.logger.debug(`Performance check failed: ${err.message}`);
    }
  }

  // ---------- PER‑COIN ANALYSIS (Enhanced) ----------
  async _generateForCoin(coin) {
    const priceData = await this._fetchPriceDataWithRetry(coin);
    if (!priceData) return null;

    if (!this.priceHistory.has(coin)) this.priceHistory.set(coin, []);
    const history = this.priceHistory.get(coin);
    history.push({
      timestamp: Date.now(),
      price: priceData.currentPrice,
      volume: priceData.volume,
      change24h: priceData.change24h,
    });
    if (history.length > this.historyLimit) history.shift();

    const rsi = this._calculateRSI(history);
    const macd = this._calculateMACD(history);
    const sma20 = this._calculateSMA(history, 20);
    const sma50 = this._calculateSMA(history, 50);
    const sma200 = this._calculateSMA(history, 200);
    const bollinger = this._calculateBollingerBands(history, 20, this.bollingerStdDev);
    const price = priceData.currentPrice;
    const volume = priceData.volume;

    let action = 'HOLD';
    let confidence = 50;
    const reasons = [];
    let indicatorCount = 0;
    let rsiValue = null;

    // ---- RSI ----
    if (rsi !== null) {
      rsiValue = rsi;
      if (rsi < this.rsiOversold) {
        action = 'BUY';
        confidence += 20;
        reasons.push(`RSI oversold (${rsi.toFixed(0)})`);
        indicatorCount++;
      } else if (rsi > this.rsiOverbought) {
        action = 'SELL';
        confidence += 20;
        reasons.push(`RSI overbought (${rsi.toFixed(0)})`);
        indicatorCount++;
      }
    }

    // ---- MACD ----
    if (macd) {
      if (macd.histogram > 0 && macd.histogram > macd.prevHistogram) {
        if (action === 'HOLD') action = 'BUY';
        confidence += 10;
        reasons.push('MACD bullish crossover');
        indicatorCount++;
      } else if (macd.histogram < 0 && macd.histogram < macd.prevHistogram) {
        if (action === 'HOLD') action = 'SELL';
        confidence += 10;
        reasons.push('MACD bearish crossover');
        indicatorCount++;
      }
    }

    // ---- SMA 20 ----
    if (sma20 !== null) {
      const breakout = this.smaBreakoutPct;
      if (price > sma20 * (1 + breakout)) {
        if (action === 'HOLD') action = 'BUY';
        confidence += 10;
        reasons.push(`Above 20‑day SMA by ${(breakout*100).toFixed(0)}%`);
        indicatorCount++;
      } else if (price < sma20 * (1 - breakout)) {
        if (action === 'HOLD') action = 'SELL';
        confidence += 10;
        reasons.push(`Below 20‑day SMA by ${(breakout*100).toFixed(0)}%`);
        indicatorCount++;
      }
    }

    // ---- SMA 50 ----
    if (sma50 !== null && sma20 !== null) {
      if (sma20 > sma50 && action === 'BUY') {
        confidence += 5;
        reasons.push('Golden cross (20 > 50 SMA)');
        indicatorCount++;
      } else if (sma20 < sma50 && action === 'SELL') {
        confidence += 5;
        reasons.push('Death cross (20 < 50 SMA)');
        indicatorCount++;
      }
    }

    // ---- Bollinger ----
    if (bollinger && sma20 !== null) {
      if (price < bollinger.lower) {
        if (action === 'HOLD') action = 'BUY';
        confidence += 10;
        reasons.push(`Below lower Bollinger band (${bollinger.lower.toFixed(2)})`);
        indicatorCount++;
      } else if (price > bollinger.upper) {
        if (action === 'HOLD') action = 'SELL';
        confidence += 10;
        reasons.push(`Above upper Bollinger band (${bollinger.upper.toFixed(2)})`);
        indicatorCount++;
      }
    }

    // ---- Whale ----
    const whaleMatch = this.recentWhales.some(w => w.symbol === coin && w.usdValue > this.whaleCorrelationThreshold);
    if (whaleMatch) {
      confidence += 15;
      reasons.push('🐋 Large whale transaction');
      if (action === 'HOLD') action = 'BUY';
      indicatorCount++;
    }

    // ---- 24h change ----
    const change = priceData.change24h;
    if (change > this.min24hChange) {
      confidence += 5;
      reasons.push(`+${change.toFixed(1)}% 24h`);
      indicatorCount++;
    } else if (change < -this.min24hChange) {
      confidence += 5;
      reasons.push(`${change.toFixed(1)}% 24h`);
      indicatorCount++;
    }

    // ---- Volume ----
    if (volume > 0 && history.length > 20) {
      const avgVolume = history.slice(-20).reduce((sum, h) => sum + h.volume, 0) / 20;
      if (avgVolume > 0 && volume > avgVolume * this.volumeThreshold) {
        confidence += 8;
        reasons.push(`📊 Volume spike ${(volume/avgVolume).toFixed(1)}x avg`);
        indicatorCount++;
      }
    }

    // ---- Confluence ----
    if (indicatorCount >= 3) confidence += 10;
    confidence = Math.min(confidence, 95);

    if (confidence < this.minConfidence || reasons.length === 0) return null;

    // ---- ATR for Target / Stop-Loss (Multi-TP) ----
    let tp1 = null, tp2 = null, tp3 = null, stopLoss = null, rr = null;
    if (history.length >= 14) {
      const atr = this._calculateATR(history, 14);
      if (atr > 0) {
        const risk = atr * 1.0;
        if (action === 'BUY') {
          tp1 = price + atr * 1.5;
          tp2 = price + atr * 2.5;
          tp3 = price + atr * 4.0;
          stopLoss = price - risk;
          rr = ((tp1 - price) / risk).toFixed(1);
        } else if (action === 'SELL') {
          tp1 = price - atr * 1.5;
          tp2 = price - atr * 2.5;
          tp3 = price - atr * 4.0;
          stopLoss = price + risk;
          rr = ((price - tp1) / risk).toFixed(1);
        }
      }
    }

    // ---- Signal Expiry (1 hour from now) ----
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    // ---- Grade ----
    const grade = gradeSignal(confidence, indicatorCount, rsiValue);

    // ---- AI Trading Plan & Market Outlook ----
    let aiPlan = null, aiOutlook = null;
    if (this.openai && indicatorCount >= 2) {
      try {
        const prompt = `Given these signals for ${coin}: ${reasons.join(', ')}. Current price $${price.toFixed(2)}. 
        Write a short trading plan (1-2 sentences) and market outlook (bullish/bearish/neutral). Format: Plan: ... Outlook: ...`;
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
          temperature: 0.7,
        });
        const text = response.choices[0].message.content.trim();
        const planMatch = text.match(/Plan:\s*(.+?)(?:\s*Outlook:\s*(.+))?/i);
        if (planMatch) {
          aiPlan = planMatch[1].trim();
          aiOutlook = planMatch[2] ? planMatch[2].trim() : 'neutral';
        }
      } catch (err) {
        this.logger.debug(`AI plan failed: ${err.message}`);
      }
    }

    // ---- Reason text ----
    let reasonText = reasons.join(', ');

    // ---- Fear & Greed (for context) ----
    const fng = await this._getFearGreed();

    return {
      coin,
      action,
      confidence: Math.round(confidence),
      priceUsd: price,
      change24h: priceData.change24h,
      rsi: rsiValue !== null ? Math.round(rsiValue) : null,
      reasons: reasonText,
      timestamp: new Date().toISOString(),
      source: 'SignalAI v8.1',
      icon: action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '🟡',
      priority: confidence >= 80 ? 'High' : confidence >= 65 ? 'Medium' : 'Low',
      tp1, tp2, tp3, stopLoss, rr,
      grade,
      expiry,
      aiPlan,
      aiOutlook,
      fearGreed: fng ? `${fng.value} (${fng.classification})` : null,
    };
  }

  // ---------- ATR helper ----------
  _calculateATR(history, period) {
    if (history.length < period + 1) return 0;
    let trSum = 0;
    for (let i = history.length - period; i < history.length - 1; i++) {
      const high = Math.max(history[i].price, history[i+1].price);
      const low = Math.min(history[i].price, history[i+1].price);
      trSum += high - low;
    }
    return trSum / period;
  }

  // ---------- EMBED with ALL new features ----------
  formatSignalEmbed(signal) {
    const color = signal.action === 'BUY' ? 0x00ff88 : signal.action === 'SELL' ? 0xff4444 : 0xffaa00;
    const emoji = signal.icon || '📈';
    const priorityEmoji = signal.priority === 'High' ? '🔴' : signal.priority === 'Medium' ? '🟡' : '🟢';
    const gradeEmoji = signal.grade === 'A+' ? '🏆' : signal.grade === 'A' ? '⭐' : signal.grade === 'B' ? '✅' : '📊';

    let description = `**${signal.action}** with ${signal.confidence}% confidence [${priorityEmoji} ${signal.priority || 'Normal'}]`;
    if (signal.grade) description += ` | ${gradeEmoji} Grade: ${signal.grade}`;

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Signal: ${signal.coin}`)
      .setDescription(description)
      .setColor(color)
      .addFields(
        { name: '💵 Price (USD)', value: signal.priceUsd ? `$${signal.priceUsd.toFixed(2)}` : 'N/A', inline: true },
        { name: '📊 24h Change', value: signal.change24h !== null ? `${signal.change24h.toFixed(1)}%` : 'N/A', inline: true },
        { name: '📈 RSI', value: signal.rsi !== null ? signal.rsi.toString() : 'N/A', inline: true },
        { name: '📝 Reason', value: signal.reasons || 'No specific reason', inline: false }
      );

    // ---- Targets & Stop-Loss ----
    if (signal.tp1 && signal.stopLoss) {
      embed.addFields(
        { name: '🎯 TP1', value: `$${signal.tp1.toFixed(2)}`, inline: true },
        { name: '🎯 TP2', value: `$${signal.tp2 ? signal.tp2.toFixed(2) : 'N/A'}`, inline: true },
        { name: '🎯 TP3', value: `$${signal.tp3 ? signal.tp3.toFixed(2) : 'N/A'}`, inline: true },
        { name: '🛑 Stop Loss', value: `$${signal.stopLoss.toFixed(2)}`, inline: true },
        { name: '📈 R:R', value: signal.rr ? `${signal.rr}:1` : 'N/A', inline: true }
      );
    }

    // ---- AI Plan & Outlook ----
    if (signal.aiPlan) {
      embed.addFields(
        { name: '🤖 AI Trading Plan', value: signal.aiPlan, inline: false }
      );
    }
    if (signal.aiOutlook) {
      const outlookEmoji = signal.aiOutlook.toLowerCase().includes('bull') ? '🐂' :
                           signal.aiOutlook.toLowerCase().includes('bear') ? '🐻' : '⚖️';
      embed.addFields(
        { name: `${outlookEmoji} Market Outlook`, value: signal.aiOutlook.charAt(0).toUpperCase() + signal.aiOutlook.slice(1), inline: true }
      );
    }

    // ---- Fear & Greed ----
    if (signal.fearGreed) {
      embed.addFields(
        { name: '😨 Fear & Greed', value: signal.fearGreed, inline: true }
      );
    }

    // ---- Expiry ----
    if (signal.expiry) {
      embed.addFields(
        { name: '⏰ Expires', value: `<t:${Math.floor(new Date(signal.expiry).getTime() / 1000)}:R>`, inline: true }
      );
    }

    embed.addFields(
      { name: '🔗 Source', value: signal.source || 'SignalAI', inline: true },
      { name: '⏰ Time', value: `<t:${Math.floor(new Date(signal.timestamp).getTime() / 1000)}:R>`, inline: true },
      { name: 'Priority', value: signal.priority || 'Normal', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Ultra3Vault • Signal AI v8.1' });

    return embed;
  }

  // ---------- Top Gainers / Losers (Slash Command) ----------
  async cmdMarketOverview(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await this._getTopGainersLosers();
    if (!data) return interaction.editReply('❌ Failed to fetch market data.');
    const embed = new EmbedBuilder()
      .setTitle('📊 Market Overview')
      .setColor(0x3498db)
      .addFields(
        { name: '🚀 Top Gainers (24h)', value: data.gainers.map(g => `${g.symbol}: +${g.change.toFixed(1)}%`).join('\n') || 'N/A', inline: true },
        { name: '📉 Top Losers (24h)', value: data.losers.map(l => `${l.symbol}: ${l.change.toFixed(1)}%`).join('\n') || 'N/A', inline: true }
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  // ---------- Leaderboard (Slash Command) ----------
  async cmdLeaderboard(interaction) {
    const db = this.deps.db;
    const rows = await db.all(
      `SELECT userId, points, wins, losses FROM signal_leaderboard WHERE guildId = ? ORDER BY points DESC LIMIT 10`,
      [interaction.guild.id]
    );
    if (!rows.length) return interaction.reply({ content: 'No leaderboard data yet.', ephemeral: true });
    let desc = '';
    for (let i = 0; i < rows.length; i++) {
      const user = await this.client.users.fetch(rows[i].userId).catch(() => null);
      const name = user ? user.username : rows[i].userId;
      desc += `${i+1}. **${name}** – ${rows[i].points} pts (W: ${rows[i].wins}, L: ${rows[i].losses})\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Signal Leaderboard').setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---------- SLASH COMMANDS (Single /signal command) ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'signal') return;

    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'health':
        await this.cmdSignalHealth(interaction);
        break;
      case 'stats':
        await this.cmdSignalStats(interaction);
        break;
      case 'watch':
        await this.cmdSignalWatch(interaction);
        break;
      case 'portfolio':
        await this.cmdSignalPortfolio(interaction);
        break;
      case 'buy':
        await this.cmdSignalBuy(interaction);
        break;
      case 'sell':
        await this.cmdSignalSell(interaction);
        break;
      case 'market':
        await this.cmdMarketOverview(interaction);
        break;
      case 'leaderboard':
        await this.cmdLeaderboard(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ---------- Health ----------
  async cmdSignalHealth(interaction) {
    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const embed = new EmbedBuilder()
      .setTitle('📊 SignalAgent Health')
      .setColor(0x3498db)
      .addFields(
        { name: 'Status', value: '✅ Operational', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'Coins Tracked', value: this.coins.join(', '), inline: false },
        { name: 'Premium Coins', value: this.premiumCoins.join(', ') || 'None', inline: false },
        { name: 'Recent Whales', value: this.recentWhales.length.toString(), inline: true },
        { name: 'OpenAI', value: this.openai ? '✅ Available' : '❌ Disabled', inline: true },
        { name: 'Price Cache', value: `${this.priceCache.cache.size} entries`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Stats ----------
  async cmdSignalStats(interaction) {
    const { wins, losses, total, roiSum } = this.performance;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 'N/A';
    const avgROI = total > 0 ? (roiSum / total * 100).toFixed(2) : 'N/A';
    const db = this.deps.db;
    const pending = await db.get(`SELECT COUNT(*) as count FROM signal_performance WHERE outcome = 'pending'`);
    const embed = new EmbedBuilder()
      .setTitle('📊 Signal Performance Stats')
      .setColor(0x3498db)
      .addFields(
        { name: 'Total Signals', value: total.toString(), inline: true },
        { name: 'Wins', value: wins.toString(), inline: true },
        { name: 'Losses', value: losses.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Avg ROI', value: `${avgROI}%`, inline: true },
        { name: 'Pending', value: pending?.count?.toString() || '0', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Watchlist ----------
  async cmdSignalWatch(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    if (sub === 'add') {
      const coin = interaction.options.getString('coin').toUpperCase();
      const allCoins = [...new Set([...this.coins, ...this.premiumCoins])];
      if (!allCoins.includes(coin)) {
        return interaction.reply({ content: `❌ ${coin} is not tracked.`, ephemeral: true });
      }
      let row = await db.get(`SELECT watchCoins FROM user_signal_prefs WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      let watchList = row ? (row.watchCoins || '').split(',').filter(Boolean) : [];
      if (watchList.includes(coin)) return interaction.reply({ content: `You already watch ${coin}.`, ephemeral: true });
      watchList.push(coin);
      await db.run(`INSERT OR REPLACE INTO user_signal_prefs (userId, guildId, watchCoins, dmEnabled) VALUES (?, ?, ?, ?)`, [userId, guildId, watchList.join(','), 1]);
      await interaction.reply({ content: `✅ Added ${coin} to your watchlist.`, ephemeral: true });
    } else if (sub === 'remove') {
      const coin = interaction.options.getString('coin').toUpperCase();
      let row = await db.get(`SELECT watchCoins FROM user_signal_prefs WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      let watchList = row ? (row.watchCoins || '').split(',').filter(Boolean) : [];
      if (!watchList.includes(coin)) return interaction.reply({ content: `You are not watching ${coin}.`, ephemeral: true });
      watchList = watchList.filter(c => c !== coin);
      await db.run(`INSERT OR REPLACE INTO user_signal_prefs (userId, guildId, watchCoins, dmEnabled) VALUES (?, ?, ?, ?)`, [userId, guildId, watchList.join(','), 1]);
      await interaction.reply({ content: `✅ Removed ${coin} from your watchlist.`, ephemeral: true });
    } else if (sub === 'list') {
      const row = await db.get(`SELECT watchCoins FROM user_signal_prefs WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      const watchList = row ? (row.watchCoins || '').split(',').filter(Boolean) : [];
      const embed = new EmbedBuilder()
        .setTitle('📋 Your Signal Watchlist')
        .setDescription(watchList.length ? watchList.join(', ') : 'You are not watching any coins.')
        .setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- Portfolio ----------
  async cmdSignalPortfolio(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    const rows = await db.all(`SELECT coin, shares, avgPrice FROM signal_portfolio WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    if (rows.length === 0) return interaction.reply({ content: 'Your portfolio is empty.', ephemeral: true });
    let totalValue = 0, desc = '';
    for (const row of rows) {
      const priceData = await this._fetchPriceDataWithRetry(row.coin);
      const currentPrice = priceData ? priceData.currentPrice : row.avgPrice;
      const value = currentPrice * row.shares;
      totalValue += value;
      desc += `**${row.coin}**: ${row.shares} shares @ $${row.avgPrice.toFixed(2)} (current: $${currentPrice.toFixed(2)})\n`;
    }
    const embed = new EmbedBuilder().setTitle('💼 Signal Portfolio').setDescription(desc).addFields({ name: 'Total Value', value: `$${totalValue.toFixed(2)}`, inline: true }).setColor(0x00ff88);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdSignalBuy(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const coin = interaction.options.getString('coin').toUpperCase();
    const shares = interaction.options.getNumber('shares');
    if (shares <= 0) return interaction.reply({ content: 'Shares must be > 0.', ephemeral: true });
    const priceData = await this._fetchPriceDataWithRetry(coin);
    if (!priceData) return interaction.reply({ content: `❌ Could not fetch price for ${coin}.`, ephemeral: true });
    const price = priceData.currentPrice;
    const db = this.deps.db;
    let row = await db.get(`SELECT shares, avgPrice FROM signal_portfolio WHERE userId = ? AND guildId = ? AND coin = ?`, [userId, guildId, coin]);
    if (row) {
      const totalCost = row.shares * row.avgPrice + shares * price;
      const newShares = row.shares + shares;
      const newAvgPrice = totalCost / newShares;
      await db.run(`UPDATE signal_portfolio SET shares = ?, avgPrice = ? WHERE userId = ? AND guildId = ? AND coin = ?`, [newShares, newAvgPrice, userId, guildId, coin]);
    } else {
      await db.run(`INSERT INTO signal_portfolio (userId, guildId, coin, shares, avgPrice) VALUES (?, ?, ?, ?, ?)`, [userId, guildId, coin, shares, price]);
    }
    await interaction.reply({ content: `✅ Bought ${shares} shares of ${coin} at $${price.toFixed(2)}.`, ephemeral: true });
  }

  async cmdSignalSell(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const coin = interaction.options.getString('coin').toUpperCase();
    const shares = interaction.options.getNumber('shares');
    if (shares <= 0) return interaction.reply({ content: 'Shares must be > 0.', ephemeral: true });
    const db = this.deps.db;
    const row = await db.get(`SELECT shares, avgPrice FROM signal_portfolio WHERE userId = ? AND guildId = ? AND coin = ?`, [userId, guildId, coin]);
    if (!row) return interaction.reply({ content: `❌ You don't own ${coin}.`, ephemeral: true });
    if (row.shares < shares) return interaction.reply({ content: `❌ You only have ${row.shares} shares.`, ephemeral: true });
    const priceData = await this._fetchPriceDataWithRetry(coin);
    if (!priceData) return interaction.reply({ content: `❌ Could not fetch price for ${coin}.`, ephemeral: true });
    const price = priceData.currentPrice;
    if (row.shares === shares) {
      await db.run(`DELETE FROM signal_portfolio WHERE userId = ? AND guildId = ? AND coin = ?`, [userId, guildId, coin]);
    } else {
      await db.run(`UPDATE signal_portfolio SET shares = shares - ? WHERE userId = ? AND guildId = ? AND coin = ?`, [shares, userId, guildId, coin]);
    }
    await interaction.reply({ content: `✅ Sold ${shares} shares of ${coin} at $${price.toFixed(2)}.`, ephemeral: true });
  }

  // ---------- Cleanup ----------
  async destroy() {
    this.priceCache.clear();
    this.priceHistory.clear();
    this.lastSignal.clear();
    this.recentWhales = [];
    this._subscriptionCache.clear();
    await super.destroy();
  }
}

module.exports = SignalAgent;