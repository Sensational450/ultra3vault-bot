/**
 * 📈 SignalAgent v5.0
 * - Generates trading signals using:
 *   • Price + RSI (CoinGecko)
 *   • MACD, SMA crossovers
 *   • Whale correlation (from WhaleAgent)
 *   • News sentiment (from SummaryAgent)
 * - All settings hardcoded – only PREMIUM_SIGNAL_CHANNEL_ID needed
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class SignalAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    
    // Hardcoded defaults – no env vars needed
    this.coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'];
    this.minConfidence = 60;
    this.coinGeckoApi = 'https://api.coingecko.com/api/v3';

    // Price history
    this.priceHistory = new Map();
    this.historyLimit = 50;
    this.lastSignal = new Map();
    this.recentWhales = [];
    this.whaleWindow = 10 * 60 * 1000; // 10 min
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

    this.logger.info(`📈 SignalAgent v5.0 ready (coins: ${this.coins.join(', ')})`);
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
          this.emit('signal.generated', signal);
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
      if (rsi < 30) { action = 'BUY'; confidence += 20; reasons.push(`RSI oversold (${rsi.toFixed(0)})`); }
      else if (rsi > 70) { action = 'SELL'; confidence += 20; reasons.push(`RSI overbought (${rsi.toFixed(0)})`); }
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
      if (price > sma * 1.03) { if (action === 'HOLD') action = 'BUY'; confidence += 10; reasons.push('Above 20‑day SMA'); }
      else if (price < sma * 0.97) { if (action === 'HOLD') action = 'SELL'; confidence += 10; reasons.push('Below 20‑day SMA'); }
    }

    const whaleMatch = this.recentWhales.some(w => w.symbol === coin && w.usdValue > 2_000_000);
    if (whaleMatch) {
      confidence += 15;
      reasons.push('🐋 Large whale transaction');
      if (action === 'HOLD') action = 'BUY';
    }

    if (priceData.change24h > 5) { confidence += 5; reasons.push(`+${priceData.change24h.toFixed(1)}% 24h`); }
    else if (priceData.change24h < -5) { confidence += 5; reasons.push(`${priceData.change24h.toFixed(1)}% 24h`); }

    confidence = Math.min(confidence, 95);

    if (confidence < this.minConfidence || reasons.length === 0) return null;

    return {
      coin,
      action,
      confidence: Math.round(confidence),
      priceUsd: priceData.currentPrice,
      change24h: priceData.change24h,
      rsi: rsi !== null ? Math.round(rsi) : null,
      reasons: reasons.join(', '),
      timestamp: new Date().toISOString(),
      source: 'SignalAI v5.0',
      icon: action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '🟡',
    };
  }

  // ---------- WHALE EVENT ----------
  async handleWhaleEvent(tx) {
    this.recentWhales.push({ symbol: tx.symbol, usdValue: tx.usdValue, timestamp: Date.now() });
    this.recentWhales = this.recentWhales.filter(w => Date.now() - w.timestamp < this.whaleWindow);

    if (tx.usdValue < 5_000_000) return;
    if (!this.coins.includes(tx.symbol)) return;

    const signal = {
      coin: tx.symbol,
      action: 'BUY',
      confidence: 70,
      priceUsd: null,
      change24h: null,
      rsi: null,
      reasons: `🐋 Whale moved ${tx.amount} ${tx.symbol} ($${(tx.usdValue / 1e6).toFixed(1)}M) – accumulation signal`,
      timestamp: new Date().toISOString(),
      source: 'WhaleAlert',
      icon: '🐋',
    };
    this.emit('signal.generated', signal);
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
      const signal = {
        coin: 'BTC',
        action,
        confidence: 60,
        priceUsd: null,
        change24h: null,
        rsi: null,
        reasons: `📰 News sentiment (${score > 0 ? 'positive' : 'negative'}): ${data.summary.substring(0, 60)}...`,
        timestamp: new Date().toISOString(),
        source: 'NewsSentiment',
        icon: '📰',
      };
      this.emit('signal.generated', signal);
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
    const map = { BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin', XRP:'ripple', ADA:'cardano', DOGE:'dogecoin', DOT:'polkadot', AVAX:'avalanche-2', MATIC:'matic-network', LINK:'chainlink', UNI:'uniswap' };
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
      .setFooter({ text: 'Ultra3Vault • Signal AI v5.0' });
  }
}

module.exports = SignalAgent;