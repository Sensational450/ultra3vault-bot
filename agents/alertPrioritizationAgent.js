/**
 * 🧠 AlertPrioritizationAgent v6.0
 * - Listens to 'news.published' events from NewsAgent
 * - Scores importance using AI (OpenAI primary, Gemini fallback) + keyword analysis
 * - Emits 'news.important' only for high-value news
 * - Configurable threshold via ALERT_PRIORITY_THRESHOLD (default 0.5)
 * - Keyword list configurable via IMPORTANT_KEYWORDS env (comma-separated)
 * - Reduces noise and keeps your community focused
 */
const BaseAgent = require('./baseAgent');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AlertPrioritizationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    this.threshold = parseFloat(process.env.ALERT_PRIORITY_THRESHOLD) || 0.5;
    this.minLength = parseInt(process.env.ALERT_MIN_LENGTH) || 20;

    // Configurable keywords (default fallback list)
    const defaultKeywords = [
      'breaking', 'urgent', 'critical', 'major', 'new', 'update',
      'launch', 'hack', 'exploit', 'regulatory', 'sec', 'etf',
      'approval', 'rejection', 'partnership', 'integration',
      'mainnet', 'testnet', 'upgrade', 'fork', 'airdrop'
    ];
    const envKeywords = process.env.IMPORTANT_KEYWORDS;
    this.importantKeywords = envKeywords ? envKeywords.split(',').map(k => k.trim().toLowerCase()) : defaultKeywords;

    // ---- OpenAI ----
    this.openai = this.deps.openai || null;
    if (!this.openai && process.env.OPENAI_API_KEY) {
      try {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI initialized for AlertPrioritizationAgent');
      } catch (err) {
        this.logger.warn(`OpenAI init failed: ${err.message}`);
      }
    }

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }
  }

  async init() {
    await super.init();
    this.subscribe('news.published', async (data) => {
      const { item, category } = data;
      const importance = await this.evaluateImportance(item);
      if (importance.score >= this.threshold) {
        this.logger.debug(`✅ Important: ${item.title} (score: ${importance.score.toFixed(2)})`);
        this.emit('news.important', { item, category, importance });
      } else {
        this.logger.debug(`⏭️ Ignored low-priority: ${item.title} (score: ${importance.score.toFixed(2)})`);
      }
    });
    this.logger.info(`🧠 AlertPrioritizationAgent v6.0 ready (threshold: ${this.threshold}, keywords: ${this.importantKeywords.length})`);
  }

  /**
   * Score news importance (0-1)
   */
  async evaluateImportance(item) {
    const title = item.title || '';
    const description = item.description || item.contentSnippet || '';
    const text = (title + ' ' + description).toLowerCase();

    // 1. Length filter
    if (text.length < this.minLength) {
      return { score: 0, reason: 'too short' };
    }

    // 2. Keyword scoring (fast)
    let keywordScore = 0;
    for (const kw of this.importantKeywords) {
      if (text.includes(kw)) keywordScore += 0.12;
    }
    keywordScore = Math.min(keywordScore, 0.6);

    // 3. AI scoring (try OpenAI first, then Gemini)
    let aiScore = null;
    if (this.openai) {
      try {
        aiScore = await this._scoreWithOpenAI(title, description);
        this.logger.debug('✅ OpenAI scoring success');
      } catch (err) {
        this.logger.warn(`OpenAI scoring failed: ${err.message} – trying Gemini`);
      }
    }

    if (aiScore === null && this.useGemini) {
      try {
        aiScore = await this._scoreWithGemini(title, description);
        this.logger.debug('✅ Gemini scoring success');
      } catch (err) {
        this.logger.warn(`Gemini scoring failed: ${err.message}`);
      }
    }

    // 4. Combine scores
    let finalScore;
    if (aiScore !== null) {
      // Weighted average: 60% AI, 40% keyword (AI more reliable)
      finalScore = aiScore * 0.6 + keywordScore * 0.4;
    } else {
      finalScore = keywordScore;
    }

    return {
      score: Math.min(Math.max(finalScore, 0), 1),
      source: aiScore !== null ? 'ai' : 'keyword',
    };
  }

  // ---------- AI Scoring Helpers ----------
  async _scoreWithOpenAI(title, description) {
    const prompt = `Rate the importance of this crypto news on a scale of 0 to 1, where 1 is extremely important (e.g., major regulatory change, security breach, ETF approval, billion-dollar hack) and 0 is trivial (e.g., minor price movement, meme coin speculation). Return only a number between 0 and 1.\n\nTitle: ${title}\nDescription: ${description}`;
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 5,
      temperature: 0,
    });
    const score = parseFloat(response.choices[0].message.content);
    if (isNaN(score) || score < 0 || score > 1) throw new Error('Invalid score');
    return score;
  }

  async _scoreWithGemini(title, description) {
    const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
    const prompt = `Rate the importance of this crypto news on a scale of 0 to 1, where 1 is extremely important (e.g., major regulatory change, security breach, ETF approval, billion-dollar hack) and 0 is trivial (e.g., minor price movement, meme coin speculation). Return only a number between 0 and 1.\n\nTitle: ${title}\nDescription: ${description}`;
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });
    const text = result.response.text().trim();
    const score = parseFloat(text);
    if (isNaN(score) || score < 0 || score > 1) throw new Error('Invalid score');
    return score;
  }
}

module.exports = AlertPrioritizationAgent;