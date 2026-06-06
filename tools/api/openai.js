/**
 * 🧠 OpenAI API Wrapper v5.0
 * - Chat completions (GPT-4, GPT-3.5)
 * - Embeddings (text-embedding-3-small/large)
 * - Image generation (DALL-E 2/3)
 * - Moderation (content filtering)
 * - Built‑in caching (optional)
 * - Error handling with retries
 * - Logger & eventBus integration
 */
const OpenAI = require('openai');

class OpenAIAPI {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!this.apiKey) throw new Error('❌ OPENAI_API_KEY is required');
    
    this.openai = new OpenAI({ apiKey: this.apiKey });
    this.logger = options.logger || console;
    this.eventBus = options.eventBus || null;
    this.cache = options.cache || null;          // optional cache instance (e.g., LRU)
    this.cacheTtl = options.cacheTtl || 3600000; // 1 hour default
    this.defaultModel = options.defaultModel || 'gpt-3.5-turbo';
    this.maxRetries = options.maxRetries || 2;
    this.timeout = options.timeout || 30000;
  }

  // 📡 Emit event (if eventBus provided)
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  // 🔑 Generate cache key
  _getCacheKey(type, ...args) {
    return `openai:${type}:${JSON.stringify(args)}`;
  }

  // 🔁 Retry wrapper with exponential backoff
  async _withRetry(fn, context) {
    let lastError;
    for (let i = 0; i <= this.maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (i < this.maxRetries && err.status !== 401 && err.status !== 403) {
          const delay = Math.pow(2, i) * 1000;
          this.logger.warn(`🔄 OpenAI ${context} retry ${i+1}/${this.maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    this._handleError(lastError, context);
  }

  _handleError(error, context) {
    const status = error.status || error.response?.status;
    const message = error.message || error.error?.message || 'Unknown error';
    this.logger.error(`❌ OpenAI ${context} failed: ${message} (${status})`);
    this._emit('openai.error', { context, error: message, status });
    throw new Error(`OpenAI ${context}: ${message}`);
  }

  /**
   * 💬 Chat completion (with optional system prompt)
   * @param {string} prompt - User message
   * @param {Object} options - { system, model, temperature, maxTokens, userId, cache }
   * @returns {Promise<string>} Assistant's reply
   */
  async chat(prompt, options = {}) {
    const {
      system = null,
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 1000,
      userId = null,
      cache = false,
    } = options;

    const cacheKey = cache ? this._getCacheKey('chat', model, system, prompt, temperature, maxTokens) : null;
    if (cache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        this.logger.debug('📦 OpenAI chat cache hit');
        return cached.data;
      }
    }

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const response = await this._withRetry(async () => {
      return await this.openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });
    }, 'chat');

    const reply = response.choices[0].message.content;
    if (cache && this.cache && cacheKey) {
      this.cache.set(cacheKey, { data: reply, timestamp: Date.now() });
    }
    this._emit('openai.chat', { userId, model, promptLength: prompt.length, replyLength: reply.length });
    return reply;
  }

  /**
   * 🧬 Get embeddings for a text (vector representation)
   * @param {string|string[]} input - Text or array of texts
   * @param {string} model - 'text-embedding-3-small' or 'text-embedding-3-large'
   * @param {Object} options - { userId, cache }
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embed(input, model = 'text-embedding-3-small', options = {}) {
    const { cache = false } = options;
    const cacheKey = cache ? this._getCacheKey('embed', model, input) : null;
    if (cache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        this.logger.debug('📦 OpenAI embed cache hit');
        return cached.data;
      }
    }

    const response = await this._withRetry(async () => {
      return await this.openai.embeddings.create({
        model,
        input,
      });
    }, 'embed');

    const embeddings = response.data.map(item => item.embedding);
    if (cache && this.cache && cacheKey) {
      this.cache.set(cacheKey, { data: embeddings, timestamp: Date.now() });
    }
    return embeddings;
  }

  /**
   * 🎨 Generate an image (DALL-E 2 or 3)
   * @param {string} prompt - Image description
   * @param {Object} options - { size, quality, style, model, userId }
   * @returns {Promise<string>} URL of generated image
   */
  async generateImage(prompt, options = {}) {
    const {
      size = '1024x1024',
      quality = 'standard', // 'standard' or 'hd'
      style = 'vivid',      // 'vivid' or 'natural'
      model = 'dall-e-3',
      userId = null,
    } = options;

    const response = await this._withRetry(async () => {
      return await this.openai.images.generate({
        model,
        prompt,
        n: 1,
        size,
        quality,
        style,
      });
    }, 'image generation');

    const imageUrl = response.data[0].url;
    this._emit('openai.image', { userId, prompt, size, model });
    return imageUrl;
  }

  /**
   * 🛡️ Moderate content (check for policy violations)
   * @param {string} text - Content to moderate
   * @returns {Promise<Object>} Flags and categories
   */
  async moderate(text) {
    const response = await this._withRetry(async () => {
      return await this.openai.moderations.create({ input: text });
    }, 'moderation');

    const result = response.results[0];
    return {
      flagged: result.flagged,
      categories: result.categories,
      scores: result.category_scores,
    };
  }

  /**
   * 📊 Get token usage estimation (approximate, not exact)
   * @param {string} text - Input text
   * @returns {number} Approximate token count
   */
  estimateTokens(text) {
    // Very rough: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * 🧹 Clear cache (if used)
   */
  clearCache() {
    if (this.cache && typeof this.cache.clear === 'function') {
      this.cache.clear();
      this.logger.info('🗑️ OpenAI cache cleared');
    }
  }
}

module.exports = { OpenAIAPI };