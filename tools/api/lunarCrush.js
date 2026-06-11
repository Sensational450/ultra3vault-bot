/**
 * LunarCrush API Wrapper v5.0
 * - Fetches social sentiment, trending coins, and engagement metrics
 * - Requires free API key (sign up at https://lunarcrush.com/developers)
 * - Returns normalised data for coins or news
 */
const axios = require('axios');

class LunarCrushAPI {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - LunarCrush API key (required)
   * @param {string} options.baseUrl - API base URL (default: https://lunarcrush.com/api4)
   * @param {number} options.timeout - Request timeout in ms (default: 10000)
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('LunarCrushAPI requires an API key');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://lunarcrush.com/api4';
    this.timeout = options.timeout || 10000;
    this.logger = options.logger || console;
  }

  /**
   * Get trending coins based on social activity.
   * @param {Object} options
   * @param {number} options.limit - Number of coins (default 10, max 50)
   * @param {string} options.sort - Sort by 'social_score', 'market_cap', 'volume' (default 'social_score')
   * @param {string} options.order - 'desc' or 'asc' (default 'desc')
   * @returns {Promise<Array>} List of coins with social metrics
   */
  async getTrendingCoins(options = {}) {
    const { limit = 10, sort = 'social_score', order = 'desc' } = options;
    try {
      const response = await axios.get(`${this.baseUrl}/trending`, {
        params: {
          key: this.apiKey,
          limit: Math.min(limit, 50),
          sort,
          order,
        },
        timeout: this.timeout,
      });
      const data = response.data?.data || [];
      return data.map(coin => ({
        symbol: coin.symbol,
        name: coin.name,
        price: coin.price,
        volume: coin.volume_24h,
        marketCap: coin.market_cap,
        socialScore: coin.social_score,
        sentiment: coin.sentiment,
        bullishIntensity: coin.bullish_intensity,
        activity: coin.alt_rank,
        timestamp: new Date(),
      }));
    } catch (err) {
      this.logger.error(`LunarCrushAPI getTrendingCoins error: ${err.message}`);
      return [];
    }
  }

  /**
   * Get social sentiment for a specific coin.
   * @param {string} symbol - Coin symbol (e.g., 'BTC', 'ETH')
   * @returns {Promise<Object>} Sentiment metrics
   */
  async getCoinSentiment(symbol) {
    try {
      const response = await axios.get(`${this.baseUrl}/assets`, {
        params: {
          key: this.apiKey,
          symbol,
        },
        timeout: this.timeout,
      });
      const data = response.data?.data?.[0];
      if (!data) {
        this.logger.warn(`No sentiment data for ${symbol}`);
        return null;
      }
      return {
        symbol: data.symbol,
        name: data.name,
        price: data.price,
        socialScore: data.social_score,
        sentiment: data.sentiment,
        bullishIntensity: data.bullish_intensity,
        bearishIntensity: data.bearish_intensity,
        posts24h: data.posts_24h,
        interactions24h: data.interactions_24h,
        timestamp: new Date(),
      };
    } catch (err) {
      this.logger.error(`LunarCrushAPI getCoinSentiment error for ${symbol}: ${err.message}`);
      return null;
    }
  }

  /**
   * Get news feed with social engagement.
   * @param {number} limit - Number of articles (default 10, max 50)
   * @returns {Promise<Array>} News articles with engagement metrics
   */
  async getNewsFeed(limit = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/news`, {
        params: {
          key: this.apiKey,
          limit: Math.min(limit, 50),
        },
        timeout: this.timeout,
      });
      const articles = response.data?.data || [];
      return articles.map(article => ({
        title: article.title,
        link: article.link,
        source: article.source,
        publishedAt: article.published_at,
        socialScore: article.social_score,
        interactions: article.interactions,
        sentiment: article.sentiment,
      }));
    } catch (err) {
      this.logger.error(`LunarCrushAPI getNewsFeed error: ${err.message}`);
      return [];
    }
  }
}

module.exports = { LunarCrushAPI };