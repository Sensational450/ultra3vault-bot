/**
 * 📈 SignalAgent v6.1 (Webhook Ready)
 * - Generates trading signals using:
 *   • Price + RSI (CoinGecko)
 *   • MACD, SMA crossovers
 *   • Whale correlation (from WhaleAgent)
 *   • News sentiment (from SummaryAgent)
 * - Sends signals via "Quant" webhook (if PREMIUM_SIGNAL_WEBHOOK_URL is set)
 * - Falls back to emitting 'signal.generated' event
 * - All thresholds and coin list are configurable via env
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const axios = require('axios');

class SignalAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config from Environment ----
    this.coins = (process.env.SIGNAL_COINS || 'BTC,ETH,SOL,BNB,XRP,ADA')
      .split(',').map(c => c.trim().toUpperCase());

    this.minConfidence = parseFloat(process.env.SIGNAL_MIN_CONFIDENCE) || 60;
    this.whaleWindow = parseInt(process.env.SIGNAL_WHALE_WINDOW_MS) || 10 * 60 * 1000; // 10 min
    this.whaleCorrelationThreshold = parseFloat(process.env.SIGNAL_WHALE_CORRELATION_VALUE) || 2_000_000; // $2M
    this.whaleImmediateThreshold = parseFloat(process.env.SIGNAL_WHALE_IMMEDIATE_VALUE) || 5_000_000; // $5M
    this.rsiOversold = parseFloat(process.env.SIGNAL_RSI_OVERSOLD) || 30;
    this.rsiOverbought = parseFloat(process.env.SIGNAL_RSI_OVERBOUGHT) || 70;
    this.smaBreakoutPct = parseFloat(process.env.SIGNAL_SMA_BREAKOUT_PCT) || 0.03; // 3%
    this.min24hChange = parseFloat(process.env.SIGNAL_MIN_24H_CHANGE) || 5; // 5%
    this.historyLimit = parseInt(process.env.SIGNAL_HISTORY_LIMIT) || 50;

    // ---- Webhook ----
    this.webhookUrl = process.env.PREMIUM_SIGNAL_WEBHOOK_URL;
    this.webhookUsername = 'Quant';
    this.webhookAvatar = process.env.PREMIUM_SIGNAL_WEBHOOK_AVATAR || null;

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

    // Price history and tracking
    this.priceHistory = new Map();
    this.lastSignal = new Map();
    this.recentWhales = [];
  }

  async init() {
    await super.init();

    this.subscribe('job.signalCheck', async () => {
      await this.generateSignals();
    });

    this.subscribe('whale.detected', async (tx) => {
      await this.handleWhaleEvent(tx);
    });

    this.subscribe('news.summarized', async (data) => {
      await this.handleNewsEvent(data);
    });

    this.logger.info(`📈 SignalAgent v6.1 ready (coins: ${this.coins.join(', ')})` +
      (this.webhookUrl ? ' (Quant webhook)' : ''));
  }

  // ---------- Helper: Send via Webhook or Emit Event ----------
  async _sendSignal(signal) {
    // 1. Try webhook if available
    if (this.webhookUrl) {
      try {
        const embed = this.formatSignalEmbed(signal);
        const webhook = new WebhookClient({ url: this.webhookUrl });
        await webhook.send({
          username: this.webhookUsername,
          avatarURL: this.webhookAvatar || undefined,
          embeds: [embed],
        });
        this.logger.debug(`✅ Signal sent via Quant webhook (${signal.coin} ${signal.action})`);
        return; // Success – skip event emission
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to event emission`);
      }
    }

    // 2. Fallback: emit event (handled by index.js)
    this.emit('signal.generated', signal);
    this.logger.debug(`✅ Signal emitted as event (fallback)`);
  }

  // ---------- GENERATE SIGNALS ----------
  async generateSignals() {
    for (const coin of this.coins) {
      try {
        const signal = await this._generateForCoin(coin);
        if (signal && signal.confidence >= this.minConfidence) {
          const key = `${coin}_${signal.action}`;
          if (this.lastSignal.has(key) && Date.now() - this.lastSignal.get(key) < 60 * 60 * 1000) continue;
          this.lastSignal.set(key, Date.now());
          await this._sendSignal(signal);
          this.logger.info(`📈 Signal: ${coin} ${signal.action} (${signal.confidence}%)`);
        }
      } catch (err) {
        this.logger.debug(`Signal failed for ${coin}: ${err.message}`);
      }
    }
  }

  // ---------- PER‑COIN ANALYSIS ----------
  async _generateForCoin(coin) {
    const priceData = await this._fetchPriceData(coin);
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
    const sma = this._calculateSMA(history, 20);
    const price = priceData.currentPrice;

    let action = 'HOLD';
    let confidence = 50;
    const reasons = [];

    if (rsi !== null) {
      if (rsi < this.rsiOversold) {
        action = 'BUY';
        confidence += 20;
        reasons.push(`RSI oversold (${rsi.toFixed(0)})`);
      } else if (rsi > this.rsiOverbought) {
        action = 'SELL';
        confidence += 20;
        reasons.push(`RSI overbought (${rsi.toFixed(0)})`);
      }
    }

    if (macd) {
      if (macd.histogram > 0 && macd.histogram > macd.prevHistogram) {
        if (action === 'HOLD') action = 'BUY';
        confidence += 10;
        reasons.push('MACD bullish crossover');
      } else if (macd.histogram < 0 && macd.histogram < macd.prevHistogram) {
        if (action === 'HOLD') action = 'SELL';
        confidence += 10;
        reasons.push('MACD bearish crossover');
      }
    }

    if (sma !== null) {
      const breakout = this.smaBreakoutPct;
      if (price > sma * (1 + breakout)) {
        if (action === 'HOLD') action = 'BUY';
        confidence += 10;
        reasons.push(`Above 20‑day SMA by ${(breakout*100).toFixed(0)}%`);
      } else if (price < sma * (1 - breakout)) {
        if (action === 'HOLD') action = 'SELL';
        confidence += 10;
        reasons.push(`Below 20‑day SMA by ${(breakout*100).toFixed(0)}%`);
      }
    }

    const whaleMatch = this.recentWhales.some(w => w.symbol === coin && w.usdValue > this.whaleCorrelationThreshold);
    if (whaleMatch) {
      confidence += 15;
      reasons.push('🐋 Large whale transaction');
      if (action === 'HOLD') action = 'BUY';
    }

    const change = priceData.change24h;
    if (change > this.min24hChange) {
      confidence += 5;
      reasons.push(`+${change.toFixed(1)}% 24h`);
    } else if (change < -this.min24hChange) {
      confidence += 5;
      reasons.push(`${change.toFixed(1)}% 24h`);
    }

    confidence = Math.min(confidence, 95);

    if (confidence < this.minConfidence || reasons.length === 0) return null;

    // Enhance reason with AI (if available)
    let reasonText = reasons.join(', ');
    if (this.openai) {
      try {
        const prompt = `Given these technical signals for ${coin}: ${reasonText}. Current price $${price.toFixed(2)}. Write a short, actionable insight (1 sentence).`;
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 60,
          temperature: 0.7,
        });
        reasonText = response.choices[0].message.content.trim();
      } catch (err) {
        this.logger.debug(`AI enhancement failed: ${err.message}`);
      }
    }

    return {
      coin,
      action,
      confidence: Math.round(confidence),
      priceUsd: priceData.currentPrice,
      change24h: priceData.change24h,
      rsi: rsi !== null ? Math.round(rsi) : null,
      reasons: reasonText,
      timestamp: new Date().toISOString(),
      source: 'SignalAI v6.1',
      icon: action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '🟡',
    };
  }

  // ---------- WHALE EVENT ----------
  async handleWhaleEvent(tx) {
    this.recentWhales.push({ symbol: tx.symbol, usdValue: tx.usdValue, timestamp: Date.now() });
    this.recentWhales = this.recentWhales.filter(w => Date.now() - w.timestamp < this.whaleWindow);

    if (tx.usdValue < this.whaleImmediateThreshold) return;
    if (!this.coins.includes(tx.symbol)) return;

    let reason = `🐋 Whale moved ${tx.amount} ${tx.symbol} ($${(tx.usdValue / 1e6).toFixed(1)}M) – accumulation signal`;
    if (this.openai) {
      try {
        const prompt = `Given a whale transaction of ${tx.amount} ${tx.symbol} worth $${(tx.usdValue / 1e6).toFixed(1)}M, write a short insight (1 sentence) on the potential market impact.`;
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
          temperature: 0.7,
        });
        reason = response.choices[0].message.content.trim();
      } catch (err) {
        this.logger.debug(`AI whale enhancement failed: ${err.message}`);
      }
    }

    const signal = {
      coin: tx.symbol,
      action: 'BUY',
      confidence: 70,
      priceUsd: null,
      change24h: null,
      rsi: null,
      reasons: reason,
      timestamp: new Date().toISOString(),
      source: 'WhaleAlert',
      icon: '🐋',
    };
    await this._sendSignal(signal);
    this.logger.info(`🐋 Whale signal: ${tx.symbol} ($${(tx.usdValue / 1e6).toFixed(1)}M)`);
  }

  // ---------- NEWS EVENT ----------
  async handleNewsEvent(data) {
    const summary = data.summary.toLowerCase();
    const positive = ['surge','rally','gain','bull','launch','partnership','approval'];
    const negative = ['crash','dump','bear','hack','exploit','fraud','decline'];
    let score = 0;
    for (const w of positive) if (summary.includes(w)) score++;
    for (const w of negative) if (summary.includes(w)) score--;
    if (Math.abs(score) >= 2) {
      const action = score > 0 ? 'BUY' : 'SELL';
      let reason = `📰 News sentiment (${score > 0 ? 'positive' : 'negative'}): ${data.summary.substring(0, 60)}...`;
      if (this.openai) {
        try {
          const prompt = `Given the news sentiment (${score > 0 ? 'positive' : 'negative'}) for BTC: "${data.summary}", write a short actionable insight (1 sentence).`;
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
            temperature: 0.7,
          });
          reason = response.choices[0].message.content.trim();
        } catch (err) {
          this.logger.debug(`AI news enhancement failed: ${err.message}`);
        }
      }
      const signal = {
        coin: 'BTC',
        action,
        confidence: 60,
        priceUsd: null,
        change24h: null,
        rsi: null,
        reasons: reason,
        timestamp: new Date().toISOString(),
        source: 'NewsSentiment',
        icon: '📰',
      };
      await this._sendSignal(signal);
      this.logger.info(`📰 News signal: ${action} (score: ${score})`);
    }
  }

  // ---------- HELPERS ----------
  async _fetchPriceData(coin) {
    try {
      const id = this._getGeckoId(coin);
      const url = `${this.coinGeckoApi}/simple/price`;
      const params = { ids: id, vs_currencies: 'usd', include_24hr_change: 'true', include_24hr_vol: 'true' };
      const response = await axios.get(url, { params, timeout: 10000 });
      const data = response.data[id];
      if (!data) return null;
      return { currentPrice: data.usd, change24h: data.usd_24h_change || 0, volume: data.usd_24h_vol || 0 };
    } catch { return null; }
  }

  _getGeckoId(coin) {
    const map = {
      BTC:'bitcoin', ETH:'ethereum', SOL:'solana',
      BNB:'binancecoin', XRP:'ripple', ADA:'cardano',
      DOGE:'dogecoin', DOT:'polkadot', AVAX:'avalanche-2',
      MATIC:'matic-network', LINK:'chainlink', UNI:'uniswap'
    };
    return map[coin] || coin.toLowerCase();
  }

  _calculateRSI(history, period = 14) {
    if (history.length < period + 1) return null;
    let gains = 0, losses = 0;
    const start = history.length - period;
    for (let i = start; i < history.length - 1; i++) {
      const diff = history[i + 1].price - history[i].price;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  _calculateMACD(history) {
    if (history.length < 26) return null;
    const ema12 = this._calcEMA(history, 12);
    const ema26 = this._calcEMA(history, 26);
    if (ema12 === null || ema26 === null) return null;
    const histogram = ema12 - ema26;
    const prevEma12 = this._calcEMA(history.slice(0, -1), 12);
    const prevEma26 = this._calcEMA(history.slice(0, -1), 26);
    const prevHistogram = (prevEma12 !== null && prevEma26 !== null) ? prevEma12 - prevEma26 : histogram;
    return { histogram, prevHistogram };
  }

  _calcEMA(history, period) {
    if (history.length < period) return null;
    const prices = history.map(h => h.price);
    let ema = prices.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * (2 / (period + 1)) + ema;
    }
    return ema;
  }

  _calculateSMA(history, period) {
    if (history.length < period) return null;
    const prices = history.slice(-period).map(h => h.price);
    return prices.reduce((a,b) => a+b, 0) / period;
  }

  // ---------- DISCORD EMBED ----------
  formatSignalEmbed(signal) {
    const color = signal.action === 'BUY' ? 0x00ff88 : signal.action === 'SELL' ? 0xff4444 : 0xffaa00;
    const emoji = signal.icon || '📈';

    return new EmbedBuilder()
      .setTitle(`${emoji} Signal: ${signal.coin}`)
      .setDescription(`**${signal.action}** with ${signal.confidence}% confidence`)
      .setColor(color)
      .addFields(
        { name: '💵 Price (USD)', value: signal.priceUsd ? `$${signal.priceUsd.toFixed(2)}` : 'N/A', inline: true },
        { name: '📊 24h Change', value: signal.change24h !== null ? `${signal.change24h.toFixed(1)}%` : 'N/A', inline: true },
        { name: '📈 RSI', value: signal.rsi !== null ? signal.rsi.toString() : 'N/A', inline: true },
        { name: '📝 Reason', value: signal.reasons || 'No specific reason', inline: false },
        { name: '🔗 Source', value: signal.source || 'SignalAI', inline: true },
        { name: '⏰ Time', value: `<t:${Math.floor(new Date(signal.timestamp).getTime() / 1000)}:R>`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Signal AI v6.1' });
  }
}

module.exports = SignalAgent;