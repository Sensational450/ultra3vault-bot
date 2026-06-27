/**
 * 🎙️ AMAAgent v6.3 — AI Co‑Host for AMA Sessions (Debug + Delay)
 * - Replies instantly to /amaquestion with AI answer
 * - Added 3s delay to simulate "thinking"
 * - Detailed error logging to diagnose AI failures
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AMAAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    this.amaChannelId = process.env.AMA_CHANNEL_ID;
    this.enabled = !!this.amaChannelId;
    this.conversationMemory = new Map();
    this.memoryLimit = 50;

    // ---- OpenAI ----
    this.openai = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI initialized for AMAAgent');
      } else {
        this.logger.warn('⚠️ OPENAI_API_KEY missing – OpenAI disabled.');
      }
    } catch (err) {
      this.logger.error(`❌ OpenAI init failed: ${err.message}`);
    }

    // ---- Gemini ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }

    this.fallbackResponses = [
      "That's a great question! Let me get back to you on that.",
      "Interesting question! I'll look into this and get back to you.",
      "Thanks for asking! I'm checking on this for you.",
      "Let me find the best answer for you. One moment!",
    ];
  }

  async init() {
    await super.init();
    if (!this.enabled) {
      this.logger.warn('⚠️ AMA_CHANNEL_ID not set — AMAAgent disabled');
      return;
    }
    await this._ensureTable();
    this.subscribe('job.amasummary', async () => {
      await this._postAMASummary();
    });
    this.logger.info(`🎙️ AMAAgent v6.3 ready (channel: ${this.amaChannelId})`);
  }

  async _ensureTable() {
    try {
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS ama_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          question TEXT NOT NULL,
          answer TEXT,
          timestamp INTEGER,
          guildId TEXT
        )
      `);
      this.logger.debug('✅ ama_history table ready');
    } catch (err) {
      this.logger.error(`❌ Failed to create ama_history table: ${err.message}`);
    }
  }

  async onMessage(message) {
    if (!this.enabled) return;
    if (message.author.bot) return;
    if (message.channel.id !== this.amaChannelId) return;
    if (message.content.length < 10) return;
    if (message.content.startsWith('/')) return;
    if (message.content.startsWith('!')) return;

    const isQuestion = /[?？]/.test(message.content) ||
      /^(who|what|where|when|why|how|can|could|would|will|do|does|is|are)/i.test(message.content);
    if (!isQuestion) return;

    this._addToMemory(message.channel.id, {
      role: 'user',
      content: message.content,
      author: message.author.username,
    });

    try {
      // Artificial 3s delay to simulate "thinking"
      await new Promise(resolve => setTimeout(resolve, 3000));

      const answer = await this._generateAnswer(message.content);
      await message.reply(answer);
      await this._logQA(message.author.id, message.content, answer);
    } catch (err) {
      this.logger.error(`AMA response failed: ${err.message}`);
    }
  }

  async _generateAnswer(question, context = '') {
    const prompt = this._buildPrompt(question, context);
    let result = null;

    // 1. Try OpenAI
    if (this.openai) {
      try {
        this.logger.debug('⏳ Asking OpenAI...');
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a friendly and knowledgeable crypto community manager hosting an AMA.
              Answer questions about cryptocurrency, blockchain, DeFi, NFTs, trading, and the Ultra3Vault community.
              Keep responses concise (2-3 sentences), informative, and engaging.
              If you don't know something, say so honestly and offer to find out.
              Always be positive and encouraging.`
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 200,
          temperature: 0.7,
        });
        result = response.choices[0].message.content.trim();
        this.logger.debug('✅ OpenAI answer success');
      } catch (err) {
        this.logger.error(`❌ OpenAI failed: ${err.message}`);
        if (err.response) {
          this.logger.error(`Status: ${err.response.status} - ${err.response.statusText}`);
          this.logger.error(`Data: ${JSON.stringify(err.response.data)}`);
        }
      }
    }

    // 2. Try Gemini
    if (!result && this.useGemini) {
      try {
        this.logger.debug('⏳ Asking Gemini...');
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a friendly crypto community manager. ${prompt}` }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        });
        result = geminiResult.response.text().trim();
        this.logger.debug('✅ Gemini answer success');
      } catch (err) {
        this.logger.error(`❌ Gemini failed: ${err.message}`);
        if (err.response) {
          this.logger.error(`Status: ${err.response.status} - ${err.response.statusText}`);
        }
      }
    }

    // 3. Fallback
    if (!result) {
      result = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
      this.logger.warn('⚠️ Using fallback answer – check API keys and logs above.');
    }

    return result;
  }

  // ... (rest of the methods unchanged: _addToMemory, _getConversationContext, _buildPrompt, _logQA, _postAMASummary, onInteraction, cmdAMASummary, cmdAMAQuestion)
  // I'm omitting them here for brevity – they remain exactly as in the previous version.
}

module.exports = AMAAgent;