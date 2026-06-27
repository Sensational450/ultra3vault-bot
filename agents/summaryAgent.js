/**
 * 📝 SummaryAgent v6.0
 * - Listens to 'news.important' → creates short TL;DR
 * - Exposes 'summarize' method for commands / jobs
 * - Caches summaries to avoid duplicate work
 * - Primary: OpenAI, fallback: Gemini, last resort: keyword extraction
 * - No new environment variables – uses existing OPENAI_API_KEY and GEMINI_API_KEY
 */
const BaseAgent = require('./baseAgent');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class SummaryAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- OpenAI ----
    this.openai = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI initialized for SummaryAgent v6.0');
      } else {
        this.logger.warn('⚠️ OPENAI_API_KEY missing – OpenAI disabled.');
      }
    } catch (err) {
      this.logger.error(`❌ OpenAI init failed: ${err.message}`);
    }

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }

    // Cache to avoid re-summarizing the same content within 1 hour
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // Fallback keywords for when AI is unavailable
    this.fallbackKeywords = [
      'price', 'surge', 'crash', 'breaking', 'hack', 'launch',
      'partnership', 'update', 'major', 'warning'
    ];
  }

  async init() {
    await super.init();

    // Auto-summarize important news
    this.subscribe('news.important', async (data) => {
      const { item, category, importance } = data;
      try {
        const summary = await this.summarizeNewsItem(item);
        this.logger.debug(`📝 Summarized: ${summary.substring(0, 50)}...`);
        this.emit('news.summarized', {
          original: item,
          summary,
          category,
          importance,
        });
      } catch (err) {
        this.logger.error(`❌ Failed to summarize news: ${err.message}`);
      }
    });

    this.logger.info('📝 SummaryAgent v6.0 ready');
  }

  /**
   * Core summarization method – public and reusable
   * @param {string} text – the full text to summarize
   * @param {number} maxLength – target word count (default 50)
   * @param {string} contextHint – optional extra context (e.g., "crypto news")
   * @returns {Promise<string>}
   */
  async summarize(text, maxLength = 50, contextHint = '') {
    if (!text || text.length < 10) return text;

    // Check cache
    const cacheKey = `${text.substring(0, 100)}-${maxLength}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.summary;
    }

    let summary = null;

    // 1. Try OpenAI
    if (this.openai) {
      try {
        const prompt = `Summarize the following text in ${maxLength} words or less. Keep it clear and factual. ${contextHint ? 'Focus on: ' + contextHint : ''}\n\nText: ${text.substring(0, 4000)}`;
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: Math.min(maxLength * 4, 150),
          temperature: 0.3,
        });
        summary = response.choices[0].message.content.trim();
        this.logger.debug('✅ OpenAI summary success');
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI summary failed: ${err.message} – trying Gemini`);
      }
    }

    // 2. Try Gemini (if OpenAI failed or not available)
    if (!summary && this.useGemini) {
      try {
        summary = await this._callGemini(text, maxLength, contextHint);
        this.logger.debug('✅ Gemini summary success');
      } catch (err) {
        this.logger.warn(`⚠️ Gemini summary failed: ${err.message}`);
      }
    }

    // 3. Fallback to keyword extraction (if both AI fail)
    if (!summary) {
      summary = this._fallbackSummarize(text);
      this.logger.warn('⚠️ Using fallback keyword extraction');
    }

    // Cache it
    this.cache.set(cacheKey, { summary, timestamp: Date.now() });
    return summary;
  }

  /**
   * Call Gemini with retry on rate limits
   */
  async _callGemini(text, maxLength, contextHint, maxRetries = 2) {
    const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
    const prompt = `Summarize the following text in ${maxLength} words or less. Keep it clear and factual. ${contextHint ? 'Focus on: ' + contextHint : ''}\n\nText: ${text.substring(0, 4000)}`;

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: Math.min(maxLength * 4, 150),
            temperature: 0.3,
          },
        });
        return result.response.text().trim();
      } catch (err) {
        lastError = err;
        this.logger.warn(`Gemini attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (err.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError;
  }

  /**
   * Specialized method for news items
   */
  async summarizeNewsItem(item) {
    const fullText = `${item.title || ''}. ${item.description || item.contentSnippet || ''}`;
    return this.summarize(fullText, 20, 'cryptocurrency news');
  }

  /**
   * Summarize a conversation thread (array of messages)
   * @param {Array<string>} messages – array of message contents
   * @param {number} maxLength – target summary length
   */
  async summarizeConversation(messages, maxLength = 100) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 'No messages to summarize.';
    }
    const full = messages.join(' ').substring(0, 4000);
    const context = `Conversation with ${messages.length} messages`;
    return this.summarize(full, maxLength, context);
  }

  /**
   * Fallback when AI is unavailable
   * Simple keyword extraction + first sentence
   * @private
   */
  _fallbackSummarize(text) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length === 0) return text.substring(0, 100);

    // Score sentences by keyword density
    const scored = sentences.map((sentence) => {
      const lower = sentence.toLowerCase();
      let score = 0;
      for (const kw of this.fallbackKeywords) {
        if (lower.includes(kw)) score += 1;
      }
      return { sentence: sentence.trim(), score };
    });

    // Sort by score descending, take top 2 sentences, merge
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 2).map(s => s.sentence).join(' ');
    return top || sentences[0].trim().substring(0, 100);
  }
}

module.exports = SummaryAgent;