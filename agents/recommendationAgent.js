/**
 * 🧠 RecommendationAgent v5.0
 * - Generates crypto trading recommendations from:
 *   • SignalAgent (high‑confidence BUY/SELL)
 *   • WhaleAgent (large accumulation)
 *   • NewsAgent (sentiment)
 *   • Periodic market scan (top gainers, volume spikes)
 * - Routes to VIP (light) and PREMIUM (advanced) channels
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class RecommendationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // Hardcoded defaults
    this.coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'];
    this.coinGeckoApi = 'https://api.coingecko.com/api/v3';

    // Track what we've already recommended (dedup)
    this.recommendationCache = new Map();
    this.cacheTTL = 2 * 60 * 60 * 1000; // 2 hours
  }

  async init() {
    await super.init();

    // Listen to existing agents
    this.subscribe('signal.generated', async (data) => {
      await this._processSignal(data);
    });

    this.subscribe('whale.detected', async (data) => {
      await this._processWhale(data);
    });

    this.subscribe('news.summarized', async (data) => {
      await this._processNews(data);
    });

    // Periodic market scan (every 15 min)
    this.subscribe('job.recommendationCheck', async () => {
      await this._periodicScan();
    });

    this.logger.info('🧠 RecommendationAgent v5.0 ready');
  }

  // ---------- SIGNAL PROCESSOR ----------
  async _processSignal(signal) {
    // Only act on strong signals
    if (signal.confidence < 70) return;

    const tier = signal.confidence >= 80 ? 'premium' : 'vip';
    const action = signal.action === 'BUY' ? 'Accumulate' : 'Reduce exposure';

    const rec = {
      tier,
      asset: signal.coin,
      action,
      confidence: signal.confidence,
      reason: `📈 Signal AI: ${signal.reasons.substring(0, 80)}`,
      price: signal.priceUsd,
      source: 'SignalAI',
      urgency: signal.confidence >= 85 ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
    };

    await this._emitRecommendation(rec);
  }

  // ---------- WHALE PROCESSOR ----------
  async _processWhale(tx) {
    if (tx.usdValue < 3_000_000) return; // Only big whales
    if (!this.coins.includes(tx.symbol)) return;

    const rec = {
      tier: 'premium', // Whale alerts are premium
      asset: tx.symbol,
      action: 'Follow the whale',
      confidence: 75,
      reason: `🐋 Large accumulation: ${tx.amount} ${tx.symbol} ($${(tx.usdValue / 1e6).toFixed(1)}M moved)`,
      price: null,
      source: 'WhaleAlert',
      urgency: 'high',
      timestamp: new Date().toISOString(),
    };

    await this._emitRecommendation(rec);
  }

  // ---------- NEWS PROCESSOR ----------
  async _processNews(data) {
    const summary = data.summary.toLowerCase();
    const positive = ['surge', 'rally', 'gain', 'bull', 'launch', 'partnership', 'approval'];
    const negative = ['crash', 'dump', 'bear', 'hack', 'exploit', 'fraud', 'decline'];

    let score = 0;
    for (const w of positive) if (summary.includes(w)) score++;
    for (const w of negative) if (summary.includes(w)) score--;

    if (Math.abs(score) < 2) return;

    const action = score > 0 ? 'Consider buying' : 'Consider selling';
    const tier = Math.abs(score) >= 3 ? 'premium' : 'vip';

    const rec = {
      tier,
      asset: 'BTC (market sentiment)',
      action,
      confidence: 60 + Math.abs(score) * 5,
      reason: `📰 News sentiment (${score > 0 ? 'positive' : 'negative'}): ${data.summary.substring(0, 60)}...`,
      price: null,
      source: 'NewsSentiment',
      urgency: tier === 'premium' ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };

    await this._emitRecommendation(rec);
  }

  // ---------- PERIODIC MARKET SCAN ----------
  async _periodicScan() {
    try {
      const ids = this.coins.map(c => this._getGeckoId(c)).join(',');
      const url = `${this.coinGeckoApi}/coins/markets`;
      const params = {
        vs_currency: 'usd',
        ids: ids,
        order: 'market_cap_desc',
        per_page: 10,
        page: 1,
        sparkline: false,
      };
      const response = await axios.get(url, { params, timeout: 10000 });
      const data = response.data;

      for (const coin of data) {
        const change24h = coin.price_change_percentage_24h || 0;
        const volume = coin.total_volume || 0;

        // Top gainers (> 8%)
        if (change24h > 8) {
          const rec = {
            tier: 'vip',
            asset: coin.symbol.toUpperCase(),
            action: 'Watchlist',
            confidence: 65,
            reason: `📈 Top gainer: +${change24h.toFixed(1)}% in 24h, volume $${(volume / 1e6).toFixed(0)}M`,
            price: coin.current_price,
            source: 'MarketScan',
            urgency: 'low',
            timestamp: new Date().toISOString(),
          };
          await this._emitRecommendation(rec);
        }

        // Volume spike (> $1B)
        if (volume > 1_000_000_000 && change24h > 3) {
          const rec = {
            tier: 'premium',
            asset: coin.symbol.toUpperCase(),
            action: 'High activity',
            confidence: 70,
            reason: `📊 Volume spike: $${(volume / 1e9).toFixed(1)}B traded, ${change24h.toFixed(1)}% change`,
            price: coin.current_price,
            source: 'MarketScan',
            urgency: 'medium',
            timestamp: new Date().toISOString(),
          };
          await this._emitRecommendation(rec);
        }
      }
    } catch (err) {
      this.logger.debug(`Market scan failed: ${err.message}`);
    }
  }

  // ---------- EMIT RECOMMENDATION ----------
  async _emitRecommendation(rec) {
    // Dedup
    const key = `${rec.asset}_${rec.action}_${rec.source}`;
    if (this.recommendationCache.has(key) && Date.now() - this.recommendationCache.get(key) < this.cacheTTL) {
      return;
    }
    this.recommendationCache.set(key, Date.now());

    this.emit('recommendation.generated', rec);
    this.logger.info(`🧠 Recommendation: ${rec.asset} ${rec.action} (${rec.tier})`);
  }

  // ---------- HELPER ----------
  _getGeckoId(coin) {
    const map = {
      BTC:'bitcoin', ETH:'ethereum', SOL:'solana',
      BNB:'binancecoin', XRP:'ripple', ADA:'cardano',
      DOGE:'dogecoin', DOT:'polkadot', AVAX:'avalanche-2',
      MATIC:'matic-network', LINK:'chainlink', UNI:'uniswap'
    };
    return map[coin] || coin.toLowerCase();
  }

  // ---------- DISCORD EMBED ----------
  formatRecommendationEmbed(rec) {
    const isPremium = rec.tier === 'premium';
    const color = isPremium ? 0x9b59b6 : 0x3498db;
    const tierEmoji = isPremium ? '💎' : '🔶';
    const urgencyEmoji = rec.urgency === 'high' ? '🚨' : rec.urgency === 'medium' ? '⚡' : '📌';

    const embed = new EmbedBuilder()
      .setTitle(`${tierEmoji} ${rec.action} ${rec.asset}`)
      .setDescription(`**${rec.confidence}% confidence** | ${rec.source}`)
      .setColor(color)
      .addFields(
        { name: '💡 Reason', value: rec.reason || 'Market opportunity detected', inline: false },
        { name: '💵 Price', value: rec.price ? `$${rec.price.toFixed(2)}` : 'N/A', inline: true },
        { name: '🔥 Urgency', value: rec.urgency.toUpperCase(), inline: true },
        { name: '👑 Tier', value: rec.tier.toUpperCase(), inline: true },
        { name: '⏰ Time', value: `<t:${Math.floor(new Date(rec.timestamp).getTime() / 1000)}:R>`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Recommendation AI v5.0' });

    return embed;
  }
}

module.exports = RecommendationAgent;