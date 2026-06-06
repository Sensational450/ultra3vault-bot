/**
 * 🐦 Twitter/X API Wrapper v5.0
 * - Post tweets (with optional media)
 * - Read user timelines and mentions
 * - Search tweets
 * - Track specific keywords (via v2 filtered stream)
 * - Handle OAuth 2.0 (Bearer) and OAuth 1.0a (user context) authentication
 * - Built‑in caching (optional) to reduce API calls
 * - Rate‑limit aware with error handling
 * - Logger & eventBus integration
 */
const { TwitterApi } = require('twitter-api-v2');

class TwitterAPI {
  constructor(options = {}) {
    // OAuth 2.0 Bearer Token (app-only, read-only)
    this.bearerToken = options.bearerToken || process.env.TWITTER_BEARER_TOKEN;
    // OAuth 1.0a (user context)
    this.appKey = options.appKey || process.env.TWITTER_API_KEY;
    this.appSecret = options.appSecret || process.env.TWITTER_API_SECRET;
    this.accessToken = options.accessToken || process.env.TWITTER_ACCESS_TOKEN;
    this.accessSecret = options.accessSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;
    // OAuth 2.0 Client (for user context, if needed)
    this.clientId = options.clientId || process.env.TWITTER_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.TWITTER_CLIENT_SECRET;

    this.logger = options.logger || console;
    this.eventBus = options.eventBus || null;
    this.cache = options.cache || null;          // optional cache instance (e.g., LRU from memory/)
    this.cacheTtl = options.cacheTtl || 60000;   // default TTL: 60 seconds
    this.timeout = options.timeout || 10000;

    this.client = null;
    this.clientReadOnly = null;
    this._initialize();
  }

  /**
   * 📡 Emit event (if eventBus provided)
   */
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  /**
   * 🔑 Initialize the Twitter client based on available credentials
   */
  _initialize() {
    // 1. Bearer Token (app-only, read-only)
    if (this.bearerToken) {
      this.client = new TwitterApi(this.bearerToken);
      this.clientReadOnly = this.client.readOnly;
      this.logger.debug('🐦 Twitter API initialized with Bearer Token (app-only, read-only)');
      this._emit('twitter.ready', { authType: 'Bearer' });
      return;
    }

    // 2. OAuth 1.0a (user context, read-write)
    if (this.appKey && this.appSecret && this.accessToken && this.accessSecret) {
      this.client = new TwitterApi({
        appKey: this.appKey,
        appSecret: this.appSecret,
        accessToken: this.accessToken,
        accessSecret: this.accessSecret,
      });
      this.clientReadOnly = this.client.readOnly;
      this.logger.debug('🐦 Twitter API initialized with OAuth 1.0a (user context, read-write)');
      this._emit('twitter.ready', { authType: 'OAuth1.0a' });
      return;
    }

    // 3. OAuth 2.0 Bearer Token (app-only, read-only)
    if (this.clientId && this.clientSecret) {
      // You can generate a Bearer token from Client ID/Secret if needed, but easier to just set the token directly.
      this.logger.warn('🐦 Client ID/Secret provided, but Bearer Token is the recommended way for app-only access.');
    }

    throw new Error('🐦 Twitter API: No valid authentication credentials provided. Please set TWITTER_BEARER_TOKEN or OAuth 1.0a credentials.');
  }

  /**
   * 🔑 Generate a Bearer Token from Client ID and Secret (for apps)
   * @returns {Promise<string>} Bearer token
   */
  async generateBearerToken() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('🐦 Client ID and Client Secret are required to generate a Bearer token.');
    }
    try {
      const tempClient = new TwitterApi({ clientId: this.clientId, clientSecret: this.clientSecret });
      const { accessToken } = await tempClient.appLogin();
      this.bearerToken = accessToken;
      this._initialize(); // reinitialize with new bearer token
      this.logger.info('🐦 Bearer token generated and stored.');
      this._emit('twitter.tokenGenerated');
      return accessToken;
    } catch (error) {
      this._handleError(error, 'generateBearerToken');
    }
  }

  /**
   * 🧹 Helper to normalize tweet data
   */
  _normalizeTweet(tweet) {
    return {
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      createdAt: tweet.created_at,
      lang: tweet.lang,
      retweetCount: tweet.public_metrics?.retweet_count || 0,
      replyCount: tweet.public_metrics?.reply_count || 0,
      likeCount: tweet.public_metrics?.like_count || 0,
      quoteCount: tweet.public_metrics?.quote_count || 0,
      possiblySensitive: tweet.possibly_sensitive,
      source: tweet.source,
      attachments: tweet.attachments,
      contextAnnotations: tweet.context_annotations,
    };
  }

  /**
   * 🧹 Helper to normalize user data
   */
  _normalizeUser(user) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      description: user.description,
      verified: user.verified,
      followersCount: user.public_metrics?.followers_count || 0,
      followingCount: user.public_metrics?.following_count || 0,
      tweetCount: user.public_metrics?.tweet_count || 0,
      listedCount: user.public_metrics?.listed_count || 0,
      profileImageUrl: user.profile_image_url,
      createdAt: user.created_at,
    };
  }

  /**
   * ❌ Handle errors and rate limits
   */
  _handleError(error, context) {
    const status = error.code || error.status || error.response?.status;
    const message = error.message || 'Unknown error';
    const rateLimit = error.rateLimit;

    if (status === 429 || (rateLimit && rateLimit.remaining === 0)) {
      const resetTime = rateLimit?.reset || error.response?.headers?.['x-rate-limit-reset'];
      const wait = resetTime ? Math.max(0, resetTime * 1000 - Date.now()) : 60000;
      this.logger.warn(`🐦 Rate limit hit for ${context}. Resets in ${Math.ceil(wait / 1000)}s.`);
      this._emit('twitter.rateLimit', { context, wait, reset: resetTime });
      throw new Error(`🐦 Rate limit exceeded for ${context}. Try again later.`);
    }

    this.logger.error(`🐦 Twitter API ${context} failed: ${message} (${status})`);
    this._emit('twitter.error', { context, error: message, status });
    throw new Error(`🐦 Twitter API ${context}: ${message}`);
  }

  /**
   * 📝 Post a tweet
   * @param {string} text - The tweet text (max 280 characters)
   * @param {Object} options - { replyTo, mediaIds, quoteTweetId }
   * @returns {Promise<Object>} Tweet data
   */
  async postTweet(text, options = {}) {
    if (!this.client) throw new Error('🐦 Twitter client not initialized.');
    const { replyTo, mediaIds, quoteTweetId } = options;
    const payload = { text };
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
    if (mediaIds && mediaIds.length) payload.media = { media_ids: mediaIds };
    if (quoteTweetId) payload.quote_tweet_id = quoteTweetId;

    try {
      const tweet = await this.client.v2.tweet(payload);
      this.logger.info(`🐦 Tweet posted: ${tweet.data.id}`);
      this._emit('twitter.tweetPosted', { tweetId: tweet.data.id, text });
      return this._normalizeTweet(tweet.data);
    } catch (error) {
      this._handleError(error, 'postTweet');
    }
  }

  /**
   * 📸 Upload media (image/video) to Twitter
   * @param {Buffer|string} media - Buffer or file path
   * @param {string} type - MIME type (optional, auto-detected if file path)
   * @returns {Promise<string>} Media ID string
   */
  async uploadMedia(media, type = null) {
    if (!this.client) throw new Error('🐦 Twitter client not initialized.');
    try {
      const mediaId = await this.client.v1.uploadMedia(media, { mimeType: type });
      this.logger.info(`🐦 Media uploaded: ${mediaId}`);
      return mediaId;
    } catch (error) {
      this._handleError(error, 'uploadMedia');
    }
  }

  /**
   * 🔍 Get user by username
   * @param {string} username - Twitter username (without @)
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} User data
   */
  async getUserByUsername(username, useCache = true) {
    const cacheKey = `twitter:user:${username}`;
    if (useCache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        this.logger.debug(`🐦 Cache hit for user: ${username}`);
        return cached.data;
      }
    }

    try {
      const user = await this.clientReadOnly.v2.userByUsername(username);
      if (!user.data) throw new Error(`User ${username} not found`);
      const normalized = this._normalizeUser(user.data);
      if (useCache && this.cache) {
        this.cache.set(cacheKey, { data: normalized, timestamp: Date.now() });
      }
      return normalized;
    } catch (error) {
      this._handleError(error, 'getUserByUsername');
    }
  }

  /**
   * 📰 Get a user's timeline (recent tweets)
   * @param {string} userId - Twitter user ID
   * @param {number} limit - Max number of tweets to fetch (default 10)
   * @returns {Promise<Array>} List of tweets
   */
  async getUserTimeline(userId, limit = 10) {
    try {
      const tweets = await this.clientReadOnly.v2.userTimeline(userId, {
        max_results: Math.min(limit, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'lang', 'context_annotations', 'possibly_sensitive', 'source'],
      });
      if (!tweets.data) return [];
      return tweets.data.map(tweet => this._normalizeTweet(tweet));
    } catch (error) {
      this._handleError(error, 'getUserTimeline');
    }
  }

  /**
   * 🗣️ Get mentions for the authenticated user
   * @param {number} limit - Max number of mentions to fetch (default 10)
   * @returns {Promise<Array>} List of mention tweets
   */
  async getMentions(limit = 10) {
    if (!this.client) throw new Error('🐦 Twitter client not initialized.');
    try {
      const mentions = await this.client.v2.mentions({
        max_results: Math.min(limit, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'lang', 'source'],
      });
      if (!mentions.data) return [];
      return mentions.data.map(tweet => this._normalizeTweet(tweet));
    } catch (error) {
      this._handleError(error, 'getMentions');
    }
  }

  /**
   * 🔍 Search recent tweets (v2)
   * @param {string} query - Search query (supports Twitter operators)
   * @param {number} limit - Max number of tweets to return (default 10)
   * @returns {Promise<Array>} List of tweets
   */
  async searchTweets(query, limit = 10) {
    const cacheKey = `twitter:search:${query}:${limit}`;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        this.logger.debug(`🐦 Cache hit for search: ${query}`);
        return cached.data;
      }
    }

    try {
      const tweets = await this.clientReadOnly.v2.search(query, {
        max_results: Math.min(limit, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'lang', 'context_annotations', 'possibly_sensitive', 'source'],
      });
      const results = tweets.data ? tweets.data.map(tweet => this._normalizeTweet(tweet)) : [];
      if (this.cache) {
        this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
      }
      return results;
    } catch (error) {
      this._handleError(error, 'searchTweets');
    }
  }

  /**
   * 🔍 Get a single tweet by ID
   * @param {string} tweetId
   * @returns {Promise<Object>} Tweet data
   */
  async getTweet(tweetId) {
    try {
      const tweet = await this.clientReadOnly.v2.singleTweet(tweetId, {
        'tweet.fields': ['created_at', 'public_metrics', 'lang', 'context_annotations', 'possibly_sensitive', 'source'],
      });
      if (!tweet.data) throw new Error(`Tweet ${tweetId} not found`);
      return this._normalizeTweet(tweet.data);
    } catch (error) {
      this._handleError(error, 'getTweet');
    }
  }

  /**
   * 🗑️ Delete a tweet (requires OAuth 1.0a or OAuth 2.0 with user context)
   * @param {string} tweetId
   * @returns {Promise<boolean>}
   */
  async deleteTweet(tweetId) {
    if (!this.client) throw new Error('🐦 Twitter client not initialized.');
    try {
      await this.client.v2.deleteTweet(tweetId);
      this.logger.info(`🐦 Tweet deleted: ${tweetId}`);
      this._emit('twitter.tweetDeleted', { tweetId });
      return true;
    } catch (error) {
      this._handleError(error, 'deleteTweet');
    }
  }

  /**
   * 🧹 Clear cache
   */
  clearCache() {
    if (this.cache && typeof this.cache.clear === 'function') {
      this.cache.clear();
      this.logger.info('🗑️ Twitter cache cleared');
    } else if (this.cache instanceof Map) {
      this.cache.clear();
      this.logger.info('🗑️ Twitter cache cleared');
    }
  }
}

module.exports = { TwitterAPI };