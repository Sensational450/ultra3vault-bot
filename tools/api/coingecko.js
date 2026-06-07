/**
 * 📈 CoinGecko API Wrapper v5.0
 * - Fetch current prices (single or multiple coins)
 * - Get market data (market cap, volume, rank)
 * - Historical price data
 * - Built‑in caching (optional) to reduce API calls
 * - Now uses the free Demo API key via query parameter `x_cg_demo_api_key`
 * - Error handling and rate‑limit awareness (retry logic optional)
 */
const axios = require('axios');

class CoinGeckoAPI {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://api.coingecko.com/api/v3';
    this.apiKey = options.apiKey || process.env.COINGECKO_API_KEY;
    this.logger = options.logger || console;
    this.cache = options.cache || null;
    this.cacheTtl = options.cacheTtl || 60000; // 1 minute default TTL
    this.timeout = options.timeout || 10000;
  }

  // 🔐 Build headers (optional, not required for Demo API key)
  _getHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  // 📡 Generic GET request with caching support and API key injection
  async _get(endpoint, params = {}, useCache = true) {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;

    // Check cache
    if (useCache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        this.logger.debug(`📦 Cache hit: ${endpoint}`);
        return cached.data;
      }
    }

    try {
      // Inject API key as query parameter (for free Demo API)
      const finalParams = { ...params };
      if (this.apiKey) {
        finalParams.x_cg_demo_api_key = this.apiKey;
      }

      const response = await axios.get(url, {
        headers: this._getHeaders(),
        params: finalParams,
        timeout: this.timeout,
      });

      // Store in cache
      if (useCache && this.cache) {
        this.cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      }
      return response.data;
    } catch (error) {
      this._handleError(error, endpoint);
    }
  }

  _handleError(error, context) {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message;

    if (status === 429) {
      this.logger.warn(`⏱️ CoinGecko rate limit hit for ${context}`);
      throw new Error('CoinGecko API rate limit exceeded. Please try again later.');
    }
    this.logger.error(`❌ CoinGecko ${context} failed: ${message} (${status})`);
    throw new Error(`CoinGecko ${context}: ${message}`);
  }

  /**
   * 💵 Get current price of one or more coins in USD (or other currency)
   * @param {string|string[]} coinIds - Single coin ID or array of IDs
   * @param {string} vsCurrency - Target currency (default 'usd')
   * @returns {Promise<Object>} Object mapping coinId to price
   */
  async getPrice(coinIds, vsCurrency = 'usd') {
    const ids = Array.isArray(coinIds) ? coinIds.join(',') : coinIds;
    const data = await this._get('/simple/price', {
      ids,
      vs_currencies: vsCurrency,
    });
    return data;
  }

  /**
   * 📊 Get detailed market data for a coin
   * @param {string} coinId
   * @param {string} vsCurrency
   * @returns {Promise<Object>} Market data
   */
  async getMarketData(coinId, vsCurrency = 'usd') {
    const data = await this._get(`/coins/${coinId}`, {
      localization: false,
      tickers: false,
      market_data: true,
      community_data: false,
      developer_data: false,
      sparkline: false,
    });
    const marketData = data.market_data;
    return {
      id: coinId,
      symbol: data.symbol,
      name: data.name,
      currentPrice: marketData.current_price[vsCurrency],
      marketCap: marketData.market_cap[vsCurrency],
      marketCapRank: data.market_cap_rank,
      totalVolume: marketData.total_volume[vsCurrency],
      high24h: marketData.high_24h[vsCurrency],
      low24h: marketData.low_24h[vsCurrency],
      priceChange24h: marketData.price_change_24h,
      priceChangePercentage24h: marketData.price_change_percentage_24h,
      circulatingSupply: marketData.circulating_supply,
      totalSupply: marketData.total_supply,
      ath: marketData.ath[vsCurrency],
      athDate: marketData.ath_date[vsCurrency],
    };
  }

  /**
   * 📈 Get historical price (OHLC) for a coin
   * @param {string} coinId
   * @param {number} days
   * @param {string} vsCurrency
   * @returns {Promise<Array>} Array of [timestamp, open, high, low, close]
   */
  async getHistoricalOhlc(coinId, days = 7, vsCurrency = 'usd') {
    const data = await this._get(`/coins/${coinId}/ohlc`, {
      vs_currency: vsCurrency,
      days,
    });
    return data;
  }

  /**
   * 📈 Get simple historical price (closing price) for a coin
   * @param {string} coinId
   * @param {number} days
   * @param {string} vsCurrency
   * @returns {Promise<Array>} Array of [timestamp, price]
   */
  async getHistoricalPrices(coinId, days = 7, vsCurrency = 'usd') {
    const data = await this._get(`/coins/${coinId}/market_chart`, {
      vs_currency: vsCurrency,
      days,
    });
    return data.prices;
  }

  /**
   * 🏆 Get top N cryptocurrencies by market cap
   * @param {number} limit
   * @param {string} vsCurrency
   * @returns {Promise<Array>} List of coins with basic data
   */
  async getTopCoins(limit = 10, vsCurrency = 'usd') {
    const data = await this._get('/coins/markets', {
      vs_currency: vsCurrency,
      order: 'market_cap_desc',
      per_page: Math.min(limit, 250),
      page: 1,
      sparkline: false,
    });
    return data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      currentPrice: coin.current_price,
      marketCap: coin.market_cap,
      marketCapRank: coin.market_cap_rank,
      priceChangePercentage24h: coin.price_change_percentage_24h,
    }));
  }

  /**
   * 🔍 Search for coins by name or symbol
   * @param {string} query
   * @returns {Promise<Array>} Matching coins
   */
  async searchCoins(query) {
    const data = await this._get('/search', { query });
    return data.coins.map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      marketCapRank: coin.market_cap_rank,
      thumb: coin.thumb,
    }));
  }

  /**
   * 🧹 Clear cache for all coins (if cache is used)
   */
  clearCache() {
    if (this.cache) {
      if (typeof this.cache.clear === 'function') this.cache.clear();
      else if (this.cache instanceof Map) this.cache.clear();
      this.logger.info('🗑️ CoinGecko cache cleared');
    }
  }
}

module.exports = { CoinGeckoAPI };