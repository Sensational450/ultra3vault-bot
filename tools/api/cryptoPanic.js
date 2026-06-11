/**
 * CryptoPanic API Wrapper v5.0
 * - Fetches aggregated crypto news with optional sentiment filtering
 * - Requires free API key (sign up at https://cryptopanic.com/developers/)
 * - Returns normalised article objects
 */
const axios = require('axios');

class CryptoPanicAPI {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - CryptoPanic API key (required)
   * @param {string} options.baseUrl - API base URL (default: https://cryptopanic.com/api/v1)
   * @param {number} options.timeout - Request timeout in ms (default: 10000)
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('CryptoPanicAPI requires an API key');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://cryptopanic.com/api/v1';
    this.timeout = options.timeout || 10000;
    this.logger = options.logger || console;
  }

  /**
   * Fetch news articles.
   * @param {Object} filters - Optional filters
   * @param {number} filters.limit - Number of articles (default 10, max 50)
   * @param {string} filters.kind - 'news' (default), 'media', or 'all'
   * @param {string} filters.filter - 'rising', 'hot', 'bullish', 'bearish', 'important', or 'lol'
   * @param {string} filters.currencies - Comma-separated currency slugs (e.g., 'BTC,ETH')
   * @returns {Promise<Array<Object>>} Normalised article objects
   */
  async getNews(filters = {}) {
    const { limit = 10, kind = 'news', filter = null, currencies = null } = filters;
    try {
      const params = {
        auth_token: this.apiKey,
        public: true,
        limit: Math.min(limit, 50),
        kind,
      };
      if (filter) params.filter = filter;
      if (currencies) params.currencies = currencies;

      const response = await axios.get(`${this.baseUrl}/posts/`, {
        params,
        timeout: this.timeout,
      });
      const results = response.data?.results || [];
      if (!results.length) {
        this.logger.debug('CryptoPanicAPI: No articles returned');
        return [];
      }

      // Normalise to consistent format
      return results.map(article => ({
        title: article.title || 'Untitled',
        link: article.url || '',
        description: article.metadata?.description || article.title || '',
        source: article.domain || 'cryptopanic.com',
        publishedAt: article.published_at || new Date().toISOString(),
        image: article.metadata?.image || null,
        sentiment: article.currencies?.[0]?.sentiment || null, // 'positive', 'negative', 'neutral'
      }));
    } catch (err) {
      this.logger.error(`CryptoPanicAPI error: ${err.message}`);
      if (err.response?.status === 401) {
        this.logger.error('Invalid or missing CryptoPanic API key');
      }
      return [];
    }
  }
}

module.exports = { CryptoPanicAPI };