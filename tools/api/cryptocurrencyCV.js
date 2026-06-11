/**
 * Cryptocurrency.cv API Wrapper v5.0
 * - Fetches latest crypto news (free, no API key required)
 * - Normalises response into consistent article objects
 * - Includes timeout and error handling
 */
const axios = require('axios');

class CryptocurrencyCvAPI {
  /**
   * @param {Object} options
   * @param {string} options.baseUrl - API base URL (default: https://api.cryptocurrency.cv)
   * @param {number} options.timeout - Request timeout in ms (default: 10000)
   * @param {Object} options.logger - Logger instance (e.g., console or winston)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://api.cryptocurrency.cv';
    this.timeout = options.timeout || 10000;
    this.logger = options.logger || console;
  }

  /**
   * Fetch the latest crypto news articles.
   * @param {number} limit - Number of articles to fetch (default 5, max 50)
   * @returns {Promise<Array<Object>>} Array of normalised article objects
   */
  async getLatestNews(limit = 5) {
    try {
      const response = await axios.get(`${this.baseUrl}/latest`, {
        params: { limit: Math.min(limit, 50) },
        timeout: this.timeout,
      });

      const articles = response.data?.data || [];
      if (!articles.length) {
        this.logger.debug('CryptocurrencyCvAPI: No articles returned');
        return [];
      }

      // Normalise to consistent format
      return articles.map(article => ({
        title: article.title || 'Untitled',
        link: article.link || '',
        description: article.description || article.contentSnippet || '',
        source: article.source || 'cryptocurrency.cv',
        publishedAt: article.published_at || new Date().toISOString(),
        image: article.image || null,
      }));
    } catch (err) {
      this.logger.error(`CryptocurrencyCvAPI error: ${err.message}`);
      if (err.response) {
        this.logger.debug(`API responded with status ${err.response.status}`);
      }
      return []; // Never throw – return empty array
    }
  }
}

module.exports = { CryptocurrencyCvAPI };