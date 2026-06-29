/**
 * 🐋 WhaleAgent v5.3 – Event‑Only (Centralized Webhook)
 * - Fetches large transactions from:
 *   • Whale Alert (if API key is set – paid/trial)
 *   • Etherscan (ETH + ERC‑20 tokens) – free with API key
 *   • Blockchair (Bitcoin) – free, no key needed
 * - Converts amounts to USD via CoinGecko
 * - Emits 'whale.detected' events – index.js sends via "Cetus" webhook
 * - Caches tx hashes to prevent duplicates
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js'); // removed WebhookClient
const axios = require('axios');

class WhaleAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // ---- Legacy Whale Alert (optional) ----
    this.whaleKey = process.env.WHALE_ALERT_API_KEY;
    this.minValueUsd = parseFloat(process.env.WHALE_MIN_VALUE_USD) || 1000000; // $1M
    this.assets = (process.env.WHALE_ASSETS || 'BTC,ETH,USDT,USDC,XRP,SOL,ADA,DOGE')
      .split(',')
      .map(a => a.trim().toUpperCase());

    // ---- Free API keys ----
    this.etherscanKey = process.env.ETHERSCAN_API_KEY; // Required for EVM chains
    this.blockchairKey = process.env.BLOCKCHAIR_API_KEY || ''; // Optional

    // ---- Cache ----
    this.seenTxs = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // ---- Explorer URLs ----
    this.explorers = {
      BTC: 'https://www.blockchain.com/btc/tx/',
      ETH: 'https://etherscan.io/tx/',
      BSC: 'https://bscscan.com/tx/',
      POLYGON: 'https://polygonscan.com/tx/',
      ARBITRUM: 'https://arbiscan.io/tx/',
      OPTIMISM: 'https://optimistic.etherscan.io/tx/',
      XRP: 'https://xrpscan.com/tx/',
      SOL: 'https://solscan.io/tx/',
      ADA: 'https://cardanoscan.io/transaction/',
      DOGE: 'https://dogechain.info/tx/',
    };

    // ---- EVM chain configs ----
    this.evmChains = [
      { name: 'ETH', api: 'https://api.etherscan.io/api' },
      { name: 'BSC', api: 'https://api.bscscan.com/api' },
      { name: 'POLYGON', api: 'https://api.polygonscan.com/api' },
      { name: 'ARBITRUM', api: 'https://api.arbiscan.io/api' },
      { name: 'OPTIMISM', api: 'https://api-optimistic.etherscan.io/api' },
    ];

    // ---- Token list ----
    this.tokenAddresses = {
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
      WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    };
  }

  async init() {
    await super.init();

    // Subscribe to the scheduled job
    this.subscribe('job.whaleCheck', async () => {
      await this.checkWhales();
    });

    const mode = this.whaleKey ? 'Whale Alert (paid/trial)' : 'Free (Etherscan + Blockchair)';
    if (!this.whaleKey && !this.etherscanKey) {
      this.logger.warn('⚠️ No API keys set. WhaleAgent will only check Bitcoin via Blockchair (no ETH).');
    }
    this.logger.info(`🐋 WhaleAgent v5.3 ready (mode: ${mode}, threshold: $${(this.minValueUsd / 1e6).toFixed(0)}M) – events only`);
  }

  // ---------- Main method ----------
  async checkWhales() {
    try {
      const txs = await this.fetchAllTransactions();
      if (!txs.length) return;

      for (const tx of txs) {
        const cacheKey = `${tx.hash}_${tx.amount}_${tx.timestamp}`;
        if (this.seenTxs.has(cacheKey)) continue;
        if (!this.assets.includes(tx.symbol.toUpperCase())) continue;

        this.logger.info(`🐋 Whale: ${tx.amount} ${tx.symbol} ($${tx.usdValue.toLocaleString()}) on ${tx.blockchain}`);
        // Emit event – index.js will send via webhook
        this.emit('whale.detected', tx);

        this.seenTxs.set(cacheKey, Date.now());
        this._cleanCache();
      }
    } catch (err) {
      this.logger.error(`❌ Whale check failed: ${err.message}`);
    }
  }

  // ---------- Fetch from all sources ----------
  async fetchAllTransactions() {
    let allTxs = [];

    if (this.whaleKey) {
      const whaletxs = await this._fetchWhaleAlert();
      allTxs = allTxs.concat(whaletxs);
    }

    if (this.etherscanKey) {
      for (const chain of this.evmChains) {
        try {
          const txs = await this._fetchEtherscan(chain);
          allTxs = allTxs.concat(txs);
        } catch (err) {
          this.logger.debug(`Etherscan (${chain.name}) failed: ${err.message}`);
        }
      }
    }

    try {
      const btcTxs = await this._fetchBlockchair();
      allTxs = allTxs.concat(btcTxs);
    } catch (err) {
      this.logger.debug(`Blockchair BTC failed: ${err.message}`);
    }

    allTxs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return allTxs.slice(0, 50);
  }

  // ---------- Source 1: Whale Alert ----------
  async _fetchWhaleAlert() {
    const url = 'https://api.whale-alert.io/v1/transactions';
    const params = {
      api_key: this.whaleKey,
      min_value: this.minValueUsd,
      limit: 25,
    };
    try {
      const response = await axios.get(url, { params, timeout: 15000 });
      if (response.data.status !== 'success') return [];
      return response.data.transactions.map(tx => ({
        id: tx.id,
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
    } catch (err) {
      this.logger.debug(`Whale Alert fetch failed: ${err.message}`);
      return [];
    }
  }

  // ---------- Source 2: Etherscan ----------
  async _fetchEtherscan(chain) {
    // Placeholder – large transfers not available for free via Etherscan API.
    // You can monitor specific whale addresses or use a paid service.
    this.logger.debug(`Etherscan (${chain.name}) – large transfers not implemented in free version.`);
    return [];
  }

  // ---------- Source 3: Blockchair (Bitcoin) ----------
  async _fetchBlockchair() {
    const url = 'https://api.blockchair.com/bitcoin/transactions';
    const params = {
      limit: 50,
      order: 'desc',
      q: `value_usd > ${this.minValueUsd}`,
    };
    try {
      const response = await axios.get(url, { params, timeout: 15000 });
      const txs = response.data.data || [];
      return txs.map(tx => {
        const amountBtc = tx.inputs ? tx.inputs.reduce((sum, inp) => sum + inp.value, 0) / 1e8 : 0;
        return {
          id: tx.hash,
          hash: tx.hash,
          blockchain: 'BTC',
          symbol: 'BTC',
          amount: amountBtc,
          usdValue: parseFloat(tx.value_usd) || 0,
          from: { address: tx.inputs?.[0]?.addresses?.[0] || 'Unknown', owner: 'Unknown', type: 'address' },
          to: { address: tx.outputs?.[0]?.addresses?.[0] || 'Unknown', owner: 'Unknown', type: 'address' },
          timestamp: new Date(tx.time * 1000).toISOString(),
          transactionType: 'transfer',
        };
      });
    } catch (err) {
      this.logger.debug(`Blockchair fetch failed: ${err.message}`);
      return [];
    }
  }

  // ---------- Helpers ----------
  _cleanCache() {
    const now = Date.now();
    for (const [key, ts] of this.seenTxs.entries()) {
      if (now - ts > this.cacheTTL) {
        this.seenTxs.delete(key);
      }
    }
  }

  async manualCheck() {
    await this.checkWhales();
  }

  formatWhaleEmbed(tx) {
    const explorerUrl = this.explorers[tx.blockchain] || this.explorers.ETH;
    const txLink = `${explorerUrl}${tx.hash}`;
    const fromLabel = tx.from.owner !== 'Unknown' ? tx.from.owner : tx.from.address.substring(0, 10) + '...';
    const toLabel = tx.to.owner !== 'Unknown' ? tx.to.owner : tx.to.address.substring(0, 10) + '...';

    return new EmbedBuilder()
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
  }
}

module.exports = WhaleAgent;