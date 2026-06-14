// 📁 tools/api/defillama.js
const axios = require('axios');

class DefiLlamaAPI {
  constructor(options = {}) {
    this.baseUrl = 'https://api.llama.fi';
    this.logger = options.logger || console;
  }

  async getTrendingProtocols() {
    try {
      const response = await axios.get(`${this.baseUrl}/protocols`);
      // Sort by 1-day TVL change to find "trending" protocols
      const trending = response.data
        .sort((a, b) => (b.tvlPrevDay1 / b.tvlPrevDay1) - (a.tvlPrevDay1 / a.tvlPrevDay1))
        .slice(0, 10);
      return trending;
    } catch (error) {
      this.logger.error(`DefiLlama API error: ${error.message}`);
      return [];
    }
  }

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