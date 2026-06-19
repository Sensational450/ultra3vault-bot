/**
 * 🐋 WhaleAgent v5.0
 * - Fetches large crypto transactions from Whale Alert API
 * - Filters by min USD value (default $1M)
 * - Emits 'whale.detected' for each new transaction
 * - Caches tx hashes to prevent duplicates
 * - Optional: integrates with SummaryAgent for smart commentary
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class WhaleAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.apiKey = process.env.WHALE_ALERT_API_KEY;
    this.minValueUsd = parseFloat(process.env.WHALE_MIN_VALUE_USD) || 1000000; // $1M
    this.assets = (process.env.WHALE_ASSETS || 'BTC,ETH,USDT,USDC,XRP,SOL,ADA,DOGE')
      .split(',')
      .map(a => a.trim().toUpperCase());
    this.interval = process.env.WHALE_CHECK_INTERVAL || '*/5 * * * *'; // cron

    // Cache to avoid duplicates (tx hash + timestamp)
    this.seenTxs = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // Blockchain explorer URLs
    this.explorers = {
      BTC: 'https://www.blockchain.com/btc/tx/',
      ETH: 'https://etherscan.io/tx/',
      XRP: 'https://xrpscan.com/tx/',
      SOL: 'https://solscan.io/tx/',
      ADA: 'https://cardanoscan.io/transaction/',
      DOGE: 'https://dogechain.info/tx/',
      USDT: 'https://etherscan.io/tx/',
      USDC: 'https://etherscan.io/tx/',
    };

    // Track if we have SummaryAgent for commentary
    this.hasSummarizer = false;
  }

  async init() {
    await super.init();

    if (!this.apiKey) {
      this.logger.warn('⚠️ WHALE_ALERT_API_KEY missing – WhaleAgent disabled. Get one at https://whale-alert.io/');
      return;
    }

    // Subscribe to the scheduled whale check job
    this.subscribe('job.whaleCheck', async () => {
      await this.checkWhales();
    });

    // Detect if SummaryAgent is available (optional enhancement)
    // We'll check by listening to the event bus or checking orchestrator later
    this.logger.info(`🐋 WhaleAgent ready (threshold: $${(this.minValueUsd / 1e6).toFixed(0)}M, assets: ${this.assets.join(', ')})`);
  }

  /**
   * Main method: fetch and emit whale transactions
   */
  async checkWhales() {
    if (!this.apiKey) return;

    try {
      const txs = await this.fetchWhaleTransactions();
      if (!txs.length) return;

      for (const tx of txs) {
        // Deduplicate
        const cacheKey = `${tx.hash}_${tx.amount}_${tx.timestamp}`;
        if (this.seenTxs.has(cacheKey)) continue;

        // Filter by asset
        if (!this.assets.includes(tx.symbol.toUpperCase())) continue;

        // Emit the event
        this.logger.info(`🐋 Whale: ${tx.amount} ${tx.symbol} ($${tx.usdValue.toLocaleString()}) on ${tx.blockchain}`);
        this.emit('whale.detected', tx);

        // Cache it
        this.seenTxs.set(cacheKey, Date.now());
        this._cleanCache();
      }
    } catch (err) {
      this.logger.error(`❌ Whale check failed: ${err.message}`);
    }
  }

  /**
   * Fetch from Whale Alert API
   * Docs: https://docs.whale-alert.io/#transactions
   */
  async fetchWhaleTransactions() {
    const url = `https://api.whale-alert.io/v1/transactions`;
    const params = {
      api_key: this.apiKey,
      min_value: this.minValueUsd,
      limit: 25,
    };

    try {
      const response = await axios.get(url, { params, timeout: 15000 });
      const data = response.data;

      if (data.status !== 'success') {
        this.logger.warn(`Whale Alert API error: ${data.message || 'Unknown'}`);
        return [];
      }

      return data.transactions.map(tx => ({
        id: tx.id,
        hash: tx.hash,
        blockchain: tx.blockchain,
        symbol: tx.symbol,
        amount: parseFloat(tx.amount),
        usdValue: parseFloat(tx.amount_usd),
        from: {
          address: tx.from.address,
          owner: tx.from.owner || 'Unknown',
          type: tx.from.type,
        },
        to: {
          address: tx.to.address,
          owner: tx.to.owner || 'Unknown',
          type: tx.to.type,
        },
        timestamp: new Date(tx.timestamp).toISOString(),
        transactionType: tx.transaction_type, // 'transfer', 'approval', etc.
      }));
    } catch (err) {
      if (err.response?.status === 429) {
        this.logger.warn('⏳ Whale Alert API rate limited – will retry next cycle');
      } else {
        this.logger.error(`Whale API fetch error: ${err.message}`);
      }
      return [];
    }
  }

  /**
   * Clean old cache entries (older than TTL)
   */
  _cleanCache() {
    const now = Date.now();
    for (const [key, ts] of this.seenTxs.entries()) {
      if (now - ts > this.cacheTTL) {
        this.seenTxs.delete(key);
      }
    }
  }

  /**
   * Public method to manually check whales (for testing)
   */
  async manualCheck() {
    await this.checkWhales();
  }

  /**
   * Format a whale transaction for Discord
   * Used by the index.js listener
   */
  formatWhaleEmbed(tx) {
    const explorerUrl = this.explorers[tx.blockchain] || this.explorers.ETH;
    const txLink = `${explorerUrl}${tx.hash}`;

    const fromLabel = tx.from.owner !== 'Unknown' ? tx.from.owner : tx.from.address.substring(0, 10) + '...';
    const toLabel = tx.to.owner !== 'Unknown' ? tx.to.owner : tx.to.address.substring(0, 10) + '...';

    const embed = new EmbedBuilder()
      .setTitle(`🐋 Whale Alert: ${tx.amount.toFixed(2)} ${tx.symbol}`)
      .setDescription(`**${tx.transactionType === 'transfer' ? 'Transfer' : 'Interaction'}** on **${tx.blockchain}**`)
      .setColor(0xff7700)
      .addFields(
        { name: '💰 USD Value', value: `$${tx.usdValue.toLocaleString()}`, inline: true },
        { name: '🔗 Blockchain', value: tx.blockchain, inline: true },
        { name: '⬅️ From', value: fromLabel, inline: false },
        { name: '➡️ To', value: toLabel, inline: false },
        { name: '🔍 Transaction', value: `[View on Explorer](${txLink})`, inline: false }
      )
      .setTimestamp(new Date(tx.timestamp))
      .setFooter({ text: 'Ultra3Vault • Whale Monitor' });

    return embed;
  }
}

module.exports = WhaleAgent;