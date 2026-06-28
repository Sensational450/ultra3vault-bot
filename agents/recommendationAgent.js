/**
 * 🧠 RecommendationAgent v6.1 (Webhook Ready)
 * - Generates crypto trading recommendations from:
 *   • SignalAgent (high‑confidence BUY/SELL)
 *   • WhaleAgent (large accumulation)
 *   • NewsAgent (sentiment)
 *   • Periodic market scan (top gainers, volume spikes)
 * - Sends VIP recommendations via "Insider" webhook
 * - Sends Premium recommendations via "Quant" webhook
 * - Falls back to event-based system if webhook fails
 * - Configurable thresholds and coin list via env
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const axios = require('axios');

class RecommendationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config from Environment ----
    this.coins = (process.env.RECOMMENDATION_COINS || 'BTC,ETH,SOL,BNB,XRP,ADA')
      .split(',').map(c => c.trim().toUpperCase());

    this.cacheTTL = parseInt(process.env.RECOMMENDATION_CACHE_TTL) || 2 * 60 * 60 * 1000; // 2 hours
    this.minWhaleValue = parseFloat(process.env.RECOMMENDATION_MIN_WHALE_VALUE) || 3_000_000; // $3M
    this.topGainerThreshold = parseFloat(process.env.RECOMMENDATION_TOP_GAINER_THRESHOLD) || 8; // 8%
    this.volumeSpikeThreshold = parseFloat(process.env.RECOMMENDATION_VOLUME_SPIKE_THRESHOLD) || 1_000_000_000; // $1B
    this.minSignalConfidence = parseFloat(process.env.RECOMMENDATION_MIN_SIGNAL_CONFIDENCE) || 70;

    // ---- Webhook configs ----
    this.vipWebhookUrl = process.env.VIP_WEBHOOK_URL;
    this.vipWebhookUsername = 'Insider';
    this.vipWebhookAvatar = process.env.VIP_WEBHOOK_AVATAR || null;

    this.premiumWebhookUrl = process.env.PREMIUM_SIGNAL_WEBHOOK_URL;
    this.premiumWebhookUsername = 'Quant';
    this.premiumWebhookAvatar = process.env.PREMIUM_SIGNAL_WEBHOOK_AVATAR || null;

    // ---- OpenAI ----
    this.openai = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI available for RecommendationAgent');
      }
    } catch (err) {
      this.logger.warn('OpenAI not available – reasons will be simple.');
    }

    // Track what we've already recommended (dedup)
    this.recommendationCache = new Map();
  }

  async init() {
    await super.init();

    this.subscribe('signal.generated', async (data) => {
      await this._processSignal(data);
    });

    this.subscribe('whale.detected', async (data) => {
      await this._processWhale(data);
    });

    this.subscribe('news.summarized', async (data) => {
      await this._processNews(data);
    });

    this.subscribe('job.recommendationCheck', async () => {
      await this._periodicScan();
    });

    this.logger.info(`🧠 RecommendationAgent v6.1 ready (coins: ${this.coins.join(', ')})`);
  }

  // ---------- Helper: Send via Webhook or Emit Event ----------
  async _sendRecommendation(rec) {
    // Determine which webhook to use based on tier
    let webhookUrl, webhookUsername, webhookAvatar;
    if (rec.tier === 'vip') {
      webhookUrl = this.vipWebhookUrl;
      webhookUsername = this.vipWebhookUsername;
      webhookAvatar = this.vipWebhookAvatar;
    } else if (rec.tier === 'premium') {
      webhookUrl = this.premiumWebhookUrl;
      webhookUsername = this.premiumWebhookUsername;
      webhookAvatar = this.premiumWebhookAvatar;
    } else {
      // No webhook configured – emit event (fallback)
      this.logger.debug(`No webhook for tier ${rec.tier} – emitting event`);
      this.emit('recommendation.generated', rec);
      return;
    }

    // 1. Try webhook if available
    if (webhookUrl) {
      try {
        const embed = this.formatRecommendationEmbed(rec);
        const webhook = new WebhookClient({ url: webhookUrl });
        await webhook.send({
          username: webhookUsername,
          avatarURL: webhookAvatar || undefined,
          embeds: [embed],
        });
        this.logger.debug(`✅ Recommendation sent via webhook (${webhookUsername})`);
        return; // Success – skip event emission to avoid duplicates
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to event emission`);
      }
    }

    // 2. Fallback: emit event (handled by index.js)
    this.emit('recommendation.generated', rec);
    this.logger.debug('✅ Recommendation emitted as event (fallback)');
  }

  // ---------- SIGNAL PROCESSOR ----------
  async _processSignal(signal) {
    if (signal.confidence < this.minSignalConfidence) return;

    const tier = signal.confidence >= 80 ? 'premium' : 'vip';
    const action = signal.action === 'BUY' ? 'Accumulate' : 'Reduce exposure';
    const reason = await this._enhanceReason(signal.reasons, signal.coin, signal.action, signal.confidence);

    const rec = {
      tier,
      asset: signal.coin,
      action,
      confidence: signal.confidence,
      reason: `📈 ${reason}`,
      price: signal.priceUsd,
      source: 'SignalAI',
      urgency: signal.confidence >= 85 ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
    };

    await this._sendRecommendation(rec);
  }

  // ---------- WHALE PROCESSOR ----------
  async _processWhale(tx) {
    if (tx.usdValue < this.minWhaleValue) return;
    if (!this.coins.includes(tx.symbol)) return;

    const reason = await this._enhanceReason(
      `Large accumulation of ${tx.amount} ${tx.symbol} ($${(tx.usdValue / 1e6).toFixed(1)}M moved)`,
      tx.symbol,
      'BUY',
      75
    );

    const rec = {
      tier: 'premium',
      asset: tx.symbol,
      action: 'Follow the whale',
      confidence: 75,
      reason: `🐋 ${reason}`,
      price: null,
      source: 'WhaleAlert',
      urgency: 'high',
      timestamp: new Date().toISOString(),
    };

    await this._sendRecommendation(rec);
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
    const confidence = 60 + Math.abs(score) * 5;
    const reason = await this._enhanceReason(
      `News sentiment (${score > 0 ? 'positive' : 'negative'}): ${data.summary.substring(0, 60)}...`,
      'BTC',
      action,
      confidence
    );

    const rec = {
      tier,
      asset: 'BTC (market sentiment)',
      action,
      confidence,
      reason: `📰 ${reason}`,
      price: null,
      source: 'NewsSentiment',
      urgency: tier === 'premium' ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };

    await this._sendRecommendation(rec);
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

        if (change24h > this.topGainerThreshold) {
          const reason = await this._enhanceReason(
            `Top gainer: +${change24h.toFixed(1)}% in 24h, volume $${(volume / 1e6).toFixed(0)}M`,
            coin.symbol.toUpperCase(),
            'WATCH',
            65
          );
          const rec = {
            tier: 'vip',
            asset: coin.symbol.toUpperCase(),
            action: 'Watchlist',
            confidence: 65,
            reason: `📈 ${reason}`,
            price: coin.current_price,
            source: 'MarketScan',
            urgency: 'low',
            timestamp: new Date().toISOString(),
          };
          await this._sendRecommendation(rec);
        }

        if (volume > this.volumeSpikeThreshold && change24h > 3) {
          const reason = await this._enhanceReason(
            `Volume spike: $${(volume / 1e9).toFixed(1)}B traded, ${change24h.toFixed(1)}% change`,
            coin.symbol.toUpperCase(),
            'HIGH_ACTIVITY',
            70
          );
          const rec = {
            tier: 'premium',
            asset: coin.symbol.toUpperCase(),
            action: 'High activity',
            confidence: 70,
            reason: `📊 ${reason}`,
            price: coin.current_price,
            source: 'MarketScan',
            urgency: 'medium',
            timestamp: new Date().toISOString(),
          };
          await this._sendRecommendation(rec);
        }
      }
    } catch (err) {
      this.logger.debug(`Market scan failed: ${err.message}`);
    }
  }

  // ---------- AI ENHANCEMENT ----------
  async _enhanceReason(baseReason, asset, action, confidence) {
    if (!this.openai) return baseReason;
    try {
      const prompt = `Given this crypto market signal: ${baseReason} for ${asset} with ${action} and ${confidence}% confidence, write a short, actionable recommendation (1 sentence).`;
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.7,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      this.logger.debug(`AI enhancement failed: ${err.message}`);
      return baseReason;
    }
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
      .setFooter({ text: 'Ultra3Vault • Recommendation AI v6.1' });

    return embed;
  }
}

module.exports = RecommendationAgent;