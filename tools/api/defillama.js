// 📁 tools/api/defillama.js
const axios = require('axios');

class DefiLlamaAPI {
  constructor(options = {}) {
    this.baseUrl = 'https://api.llama.fi';
    this.logger = options.logger || console;
  }

  /**
   * Get top DeFi protocols by 24‑hour TVL growth (trending)
   * @param {number} limit - Number of protocols to return (default 10)
   * @returns {Promise<Array>} List of protocols with name, chain, TVL, and 24h change %
   */
  async getTrendingProtocols(limit = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/protocols`);
      const protocols = response.data;
      // Filter out protocols without valid previous TVL, then calculate 24h change percentage
      const withChange = protocols
        .filter(p => p.tvl && p.tvlPrevDay1 !== undefined && p.tvlPrevDay1 > 0)
        .map(p => ({
          name: p.name,
          chain: p.chain,
          tvl: p.tvl,
          tvlPrevDay: p.tvlPrevDay1,
          change24h: ((p.tvl - p.tvlPrevDay1) / p.tvlPrevDay1) * 100,
        }))
        .sort((a, b) => b.change24h - a.change24h);
      return withChange.slice(0, limit);
    } catch (error) {
      this.logger.error(`DefiLlama API error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get TVL for a specific blockchain
   * @param {string} chain - Blockchain name (e.g., 'Ethereum', 'Solana')
   * @returns {Promise<Object|null>} Chain data with TVL, market cap, etc.
   */
  async getChainTVL(chain = 'Ethereum') {
    try {
      const response = await axios.get(`${this.baseUrl}/v2/chains`);
      const chainData = response.data.find(c => c.name.toLowerCase() === chain.toLowerCase());
      return chainData || null;
    } catch (error) {
      this.logger.error(`DefiLlama API error: ${error.message}`);
      return null;
    }
  }
}

module.exports = { DefiLlamaAPI };