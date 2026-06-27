/**
 * 📅 ContentPlanningAgent v13.0 (Smart Provider Routing)
 * - Routes content to the best AI provider per task type:
 *   • VIP/Premium/DailyTheme → OpenAI (quality)
 *   • Education/Engagement/Calendar → Gemini (cost-effective)
 * - Falls back to secondary provider if primary fails
 * - Caches AI responses for 24h to reduce cost
 * - Generic fallbacks only as last resort
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class ContentPlanningAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // Channels
    this.channels = {
      announcements: process.env.ANNOUNCEMENT_CHANNEL_ID,
      general: process.env.GENERAL_CHAT_CHANNEL_ID,
      vip: process.env.VIP_CONTENT_CHANNEL_ID || process.env.VIP_NEWS_CHANNEL_ID,
      premium: process.env.PREMIUM_CONTENT_CHANNEL_ID || process.env.PREMIUM_SIGNAL_CHANNEL_ID,
    };

    // ---- OpenAI ----
    this.useOpenAI = !!process.env.OPENAI_API_KEY;
    if (this.useOpenAI) {
      this.openai = new (require('openai')).OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.logger.info('🧠 OpenAI available for ContentPlanningAI');
    } else {
      this.logger.warn('⚠️ OpenAI not available.');
    }

    // ---- Gemini (Fallback / Cost-effective) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ Gemini not available.');
    }

    // Cache for AI responses (24h TTL)
    this._contentCache = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000;

    // Track last trivia question
    this.lastTriviaQuestion = null;
  }

  async init() {
    await super.init();

    // Subscribe to scheduled jobs
    this.subscribe('job.dailyContent', async () => {
      await this._postDailyContent();
    });
    this.subscribe('job.educationalContent', async () => {
      await this._postEducationalContent();
    });
    this.subscribe('job.marketRecap', async () => {
      await this._postMarketRecap();
    });
    this.subscribe('job.engagementContent', async () => {
      await this._postEngagementContent();
    });
    this.subscribe('job.announcementReminder', async () => {
      await this._postAnnouncementReminder();
    });
    this.subscribe('job.vipContent', async () => {
      await this._postVIPContent();
    });
    this.subscribe('job.premiumContent', async () => {
      await this._postPremiumContent();
    });

    this.logger.info('📅 ContentPlanningAgent v13.0 ready (Smart Provider Routing)');
  }

  // ===================== PROVIDER ROUTER =====================
  /**
   * Determine which AI provider to use as primary for a given content type.
   * @param {string} type - Content type (e.g., 'vip', 'education')
   * @returns {string} 'openai' or 'gemini'
   */
  _getPrimaryProvider(type) {
    // High‑value content → OpenAI for quality
    const highQualityTypes = ['vip', 'premium', 'dailyTheme', 'marketRecap'];
    if (highQualityTypes.includes(type) && this.useOpenAI) {
      return 'openai';
    }
    // General/bulk content → Gemini for cost (if available)
    const lowCostTypes = ['education', 'engagement', 'calendar', 'reminder'];
    if (lowCostTypes.includes(type) && this.useGemini) {
      return 'gemini';
    }
    // If primary choice is unavailable, try the other one
    if (this.useOpenAI) return 'openai';
    if (this.useGemini) return 'gemini';
    return null; // No provider available
  }

  // ===================== AI CONTENT GENERATION (with provider routing) =====================
  async _generateContent({ type, prompt, fallback }) {
    const cacheKey = `${type}_${prompt.substring(0, 40)}`;
    if (this._contentCache.has(cacheKey)) {
      const cached = this._contentCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.content;
      } else {
        this._contentCache.delete(cacheKey);
      }
    }

    // Determine which provider to try first
    const primary = this._getPrimaryProvider(type);
    const secondary = primary === 'openai' ? 'gemini' : 'openai';

    let result = null;

    // Attempt primary provider
    if (primary === 'openai' && this.useOpenAI) {
      try {
        result = await this._callOpenAI(prompt);
        this.logger.debug(`✅ OpenAI success (${type})`);
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI failed (${type}): ${err.message}`);
      }
    } else if (primary === 'gemini' && this.useGemini) {
      try {
        result = await this._callGemini(prompt);
        this.logger.debug(`✅ Gemini success (${type})`);
      } catch (err) {
        this.logger.warn(`⚠️ Gemini failed (${type}): ${err.message}`);
      }
    }

    // If primary fails, try secondary provider
    if (!result && secondary === 'openai' && this.useOpenAI) {
      try {
        result = await this._callOpenAI(prompt);
        this.logger.debug(`✅ OpenAI fallback success (${type})`);
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI fallback failed (${type}): ${err.message}`);
      }
    } else if (!result && secondary === 'gemini' && this.useGemini) {
      try {
        result = await this._callGemini(prompt);
        this.logger.debug(`✅ Gemini fallback success (${type})`);
      } catch (err) {
        this.logger.warn(`⚠️ Gemini fallback failed (${type}): ${err.message}`);
      }
    }

    // Final fallback (generic)
    if (!result) {
      result = fallback;
      this.logger.warn(`⚠️ All AI providers failed – using fallback (${type})`);
    }

    // Cache and return
    this._contentCache.set(cacheKey, { content: result, timestamp: Date.now() });
    return result;
  }

  // ===================== PROVIDER CALL METHODS =====================
  async _callOpenAI(prompt) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a crypto community manager creating engaging Discord content.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.8,
    });
    return response.choices[0].message.content.trim();
  }

  async _callGemini(prompt, maxRetries = 2) {
    const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a crypto community manager. ${prompt}` }] }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.8,
          },
        });
        return result.response.text();
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

  // ===================== REST OF THE CODE (unchanged) =====================
  // All other methods remain exactly as they were:
  // _postDailyContent, _postEducationalContent, _postMarketRecap,
  // _postEngagementContent, _postAnnouncementReminder, _postVIPContent,
  // _postPremiumContent, _getMarketSummary, _getWhaleSummary,
  // _getTechnicalSummary, _sendToChannel, cmdPostContent, cmdContentCalendar,
  // onInteractionCreate (button handler)
  //
  // They are omitted here for brevity but should be kept unchanged.
  // You can copy them from your current version.
}