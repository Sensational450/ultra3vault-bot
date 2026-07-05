/**
 * 🧠 AiChatAgent v8.2 – Consolidated /ai Command (with Group Support)
 * - All AI features under one command: /ai
 * - Subcommands: ask, askimage, reset, sentiment, imagine, stats
 * - Groups: kb, preferences, config
 * - Knowledge Base, token analytics, signal/whale explanation, security, market summary
 * - Full integration with SignalAgent, WhaleAgent, PriceFeedAgent
 * - All existing features: multi‑AI, multimodal, feedback, tools, etc.
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const axios = require('axios');
const crypto = require('crypto');

// ---- Simple vector store (in‑memory) ----
class SimpleVectorStore {
  constructor() {
    this.documents = [];
  }
  async addDocument(content, metadata = {}) {
    const id = crypto.randomBytes(16).toString('hex');
    this.documents.push({ id, content, metadata });
    return id;
  }
  async query(query, topK = 3) {
    const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if (!words.length) return [];
    const scores = this.documents.map(doc => {
      const docWords = doc.content.toLowerCase().split(/\W+/);
      const intersection = words.filter(w => docWords.includes(w)).length;
      return { doc, score: intersection / words.length };
    });
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map(s => s.doc);
  }
}

class AiChatAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- OpenAI ----
    this.openai = null;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    if (this.openaiApiKey) {
      const OpenAI = require('openai');
      this.openai = new OpenAI({ apiKey: this.openaiApiKey });
      this.logger.info('🧠 OpenAI initialized for AiChatAgent');
    } else {
      this.logger.warn('⚠️ OPENAI_API_KEY missing – OpenAI disabled');
    }

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled');
    }

    // ---- Config ----
    this.defaultConfig = {
      enabled: !!(this.openaiApiKey || this.useGemini),
      channelWhitelist: [],
      roleWhitelist: [],
      maxTokens: 500,
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant in a Discord crypto community. Be friendly and informative.',
      rateLimitPerUser: 5,
      memoryTimeoutMinutes: 30,
      requireSubscription: false,
      enableStreaming: true,
      enableMultimodal: true,
      enableToolIntegration: true,
      tokenQuota: 100000,
    };
    this.guildConfigs = new Map();

    // ---- Fallback responses ----
    this.fallbackResponses = [
      "That's a great question! Let me get back to you on that.",
      "Interesting question! I'll look into this and get back to you.",
      "Thanks for asking! I'm checking on this for you.",
      "Let me find the best answer for you. One moment!",
    ];

    // ---- Caches & State ----
    this.answerCache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
    this._feedbackMap = new Map();
    this.blacklist = new Set();

    // ---- Vector store (Knowledge Base) ----
    this.vectorStore = deps.vectorStore || new SimpleVectorStore();
    this.logger.info('🧠 VectorStore integrated for Knowledge Base');

    // ---- Admin log webhook ----
    this.adminLogWebhook = process.env.AI_ADMIN_LOG_WEBHOOK_URL || process.env.LOG_WEBHOOK_URL;

    // ---- Integration with other agents ----
    this.signalAgent = null;
    this.whaleAgent = null;
    this.priceAgent = null;

    // ---- User preferences ----
    this._prefsCache = new Map(); // userId -> { watchCoins, expertise, notificationPrefs }
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadConfigs();
    await this._loadBlacklist();
    await this._loadUserPrefs();

    // Get references to other agents
    this.signalAgent = this.deps.orchestrator?.getAgent('SignalAgent');
    this.whaleAgent = this.deps.orchestrator?.getAgent('WhaleAgent');
    this.priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');

    const providers = [];
    if (this.openai) providers.push('OpenAI');
    if (this.useGemini) providers.push('Gemini');
    this.logger.info(`🧠 AiChatAgent v8.2 ready (providers: ${providers.join(' + ') || 'none'})`);
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        userId TEXT, guildId TEXT, role TEXT, content TEXT, timestamp INTEGER,
        PRIMARY KEY (userId, guildId, timestamp)
      );
      CREATE TABLE IF NOT EXISTS ai_rate_limits (
        userId TEXT, guildId TEXT, resetTime INTEGER, count INTEGER,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS ai_token_usage (
        userId TEXT, guildId TEXT, month INTEGER, tokensUsed INTEGER,
        PRIMARY KEY (userId, guildId, month)
      );
      CREATE TABLE IF NOT EXISTS ai_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT, guildId TEXT, prompt TEXT, response TEXT, feedback INTEGER, timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS ai_blacklist (
        userId TEXT PRIMARY KEY, guildId TEXT, reason TEXT, addedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS ai_kb_documents (
        id TEXT PRIMARY KEY, guildId TEXT, content TEXT, metadata TEXT, addedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS ai_user_prefs (
        userId TEXT, guildId TEXT, watchCoins TEXT, expertise TEXT, notificationPrefs TEXT,
        PRIMARY KEY (userId, guildId)
      );
    `);
  }

  async _loadUserPrefs() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT userId, guildId, watchCoins, expertise, notificationPrefs FROM ai_user_prefs`);
    for (const row of rows) {
      this._prefsCache.set(`${row.userId}_${row.guildId}`, {
        watchCoins: row.watchCoins ? row.watchCoins.split(',').filter(Boolean) : [],
        expertise: row.expertise || 'beginner',
        notificationPrefs: row.notificationPrefs || 'all',
      });
    }
  }

  // ---------- Config ----------
  async _loadConfigs() {
    const db = this.deps.db;
    await db.run(`CREATE TABLE IF NOT EXISTS ai_config (guildId TEXT PRIMARY KEY, config TEXT)`);
    const rows = await db.all(`SELECT guildId, config FROM ai_config`);
    for (const row of rows) {
      this.guildConfigs.set(row.guildId, JSON.parse(row.config));
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    config.enabled = !!(this.openaiApiKey || this.useGemini);
    this.guildConfigs.set(guildId, config);
    await this._saveGuildConfig(guildId, config);
    return config;
  }

  async _saveGuildConfig(guildId, config) {
    const db = this.deps.db;
    await db.run(`INSERT OR REPLACE INTO ai_config (guildId, config) VALUES (?, ?)`, [guildId, JSON.stringify(config)]);
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    await this._saveGuildConfig(guildId, config);
  }

  // ---------- Blacklist ----------
  async _loadBlacklist() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT userId FROM ai_blacklist`);
    for (const row of rows) {
      this.blacklist.add(row.userId);
    }
  }

  async _addBlacklist(userId, guildId, reason) {
    const db = this.deps.db;
    await db.run(`INSERT OR REPLACE INTO ai_blacklist (userId, guildId, reason, addedAt) VALUES (?, ?, ?, ?)`, [userId, guildId, reason, Date.now()]);
    this.blacklist.add(userId);
  }

  async _removeBlacklist(userId) {
    const db = this.deps.db;
    await db.run(`DELETE FROM ai_blacklist WHERE userId = ?`, [userId]);
    this.blacklist.delete(userId);
  }

  // ---------- Subscription ----------
  async hasActiveSubscription(userId, guildId) {
    if (!this.models?.Subscription) return false;
    const sub = await this.models.Subscription.get(userId, guildId);
    return sub && sub.expiresAt > Date.now();
  }

  // ---------- Rate limiting ----------
  async isRateLimited(userId, guildId, config) {
    const db = this.deps.db;
    const now = Date.now();
    let row = await db.get(`SELECT count, resetTime FROM ai_rate_limits WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    if (!row || now > row.resetTime) {
      await db.run(`INSERT OR REPLACE INTO ai_rate_limits (userId, guildId, count, resetTime) VALUES (?, ?, 1, ?)`, [userId, guildId, now + 60000]);
      return false;
    }
    if (row.count >= config.rateLimitPerUser) return true;
    await db.run(`UPDATE ai_rate_limits SET count = count + 1 WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    return false;
  }

  // ---------- Token usage ----------
  async trackTokenUsage(userId, guildId, tokens) {
    const db = this.deps.db;
    const now = new Date();
    const month = now.getFullYear() * 100 + now.getMonth() + 1;
    let row = await db.get(`SELECT tokensUsed FROM ai_token_usage WHERE userId = ? AND guildId = ? AND month = ?`, [userId, guildId, month]);
    if (!row) {
      await db.run(`INSERT INTO ai_token_usage (userId, guildId, month, tokensUsed) VALUES (?, ?, ?, ?)`, [userId, guildId, month, tokens]);
    } else {
      await db.run(`UPDATE ai_token_usage SET tokensUsed = tokensUsed + ? WHERE userId = ? AND guildId = ? AND month = ?`, [tokens, userId, guildId, month]);
    }
  }

  async getUserMonthlyTokens(userId, guildId) {
    const db = this.deps.db;
    const now = new Date();
    const month = now.getFullYear() * 100 + now.getMonth() + 1;
    const row = await db.get(`SELECT tokensUsed FROM ai_token_usage WHERE userId = ? AND guildId = ? AND month = ?`, [userId, guildId, month]);
    return row ? row.tokensUsed : 0;
  }

  async checkTokenQuota(userId, guildId, config) {
    const used = await this.getUserMonthlyTokens(userId, guildId);
    const quota = config.tokenQuota || 100000;
    return used < quota;
  }

  // ---------- Memory ----------
  async getMemory(userId, guildId, timeoutMinutes = 30) {
    const db = this.deps.db;
    const cutoff = Date.now() - timeoutMinutes * 60 * 1000;
    const rows = await db.all(
      `SELECT role, content FROM ai_conversations WHERE userId = ? AND guildId = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 20`,
      [userId, guildId, cutoff]
    );
    await db.run(`DELETE FROM ai_conversations WHERE userId = ? AND guildId = ? AND timestamp < ?`, [userId, guildId, cutoff]);
    return rows.map(row => ({ role: row.role, content: row.content }));
  }

  async updateMemory(userId, guildId, userMessage, assistantMessage) {
    const db = this.deps.db;
    const now = Date.now();
    await db.run(`INSERT INTO ai_conversations (userId, guildId, role, content, timestamp) VALUES (?, ?, 'user', ?, ?)`, [userId, guildId, userMessage, now]);
    await db.run(`INSERT INTO ai_conversations (userId, guildId, role, content, timestamp) VALUES (?, ?, 'assistant', ?, ?)`, [userId, guildId, assistantMessage, now]);
  }

  async clearMemory(userId, guildId) {
    const db = this.deps.db;
    await db.run(`DELETE FROM ai_conversations WHERE userId = ? AND guildId = ?`, [userId, guildId]);
  }

  // ---------- Context summarization ----------
  async summarizeMemory(userId, guildId, messages) {
    if (messages.length <= 15) return messages;
    const toSummarize = messages.slice(0, messages.length - 10);
    const recent = messages.slice(messages.length - 10);
    const summaryPrompt = `Summarise the following conversation into a concise paragraph (max 50 words):\n\n${toSummarize.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    let summary = '';
    try {
      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: summaryPrompt }],
          max_tokens: 100,
          temperature: 0.3,
        });
        summary = response.choices[0].message.content.trim();
      } else if (this.useGemini) {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const result = await model.generateContent(summaryPrompt);
        summary = result.response.text().trim();
      }
    } catch (err) {
      this.logger.debug(`Summarisation failed: ${err.message}`);
      return messages;
    }
    return [{ role: 'system', content: `Previous conversation summary: ${summary}` }, ...recent];
  }

  // ---------- Knowledge Base ----------
  async addDocument(guildId, content, metadata = {}) {
    const id = await this.vectorStore.addDocument(content, { ...metadata, guildId });
    const db = this.deps.db;
    await db.run(
      `INSERT INTO ai_kb_documents (id, guildId, content, metadata, addedAt) VALUES (?, ?, ?, ?, ?)`,
      [id, guildId, content, JSON.stringify(metadata), Date.now()]
    );
    return id;
  }

  async queryKnowledgeBase(query, guildId, topK = 3) {
    const docs = await this.vectorStore.query(query, topK);
    const guildDocs = docs.filter(d => d.metadata?.guildId === guildId);
    return guildDocs.map(d => d.content).join('\n---\n');
  }

  // ---------- Tools Integration ----------
  async executeTool(query, userId = null, guildId = null) {
    const lower = query.toLowerCase();

    // Price
    if (lower.includes('price') || lower.includes('btc') || lower.includes('eth') || lower.includes('sol')) {
      if (this.priceAgent) {
        const coinMatch = lower.match(/\b(btc|eth|sol|bnb|xrp|ada|doge|dot|avax|matic)\b/i);
        const coin = coinMatch ? coinMatch[0].toLowerCase() : 'bitcoin';
        try {
          const priceData = await this.priceAgent.fetchPrice(coin);
          if (priceData) {
            return `Current price of ${coin.toUpperCase()}: $${priceData.usd.toFixed(2)} (24h: ${priceData.change24h?.toFixed(1)}%)`;
          }
        } catch (err) { /* ignore */ }
      }
    }

    // News
    if (lower.includes('news')) {
      const newsAgent = this.deps.orchestrator?.getAgent('NewsAgent');
      if (newsAgent) {
        return "I can fetch the latest crypto news for you. Use `/news` or check #crypto-news.";
      }
    }

    // Whale
    if (lower.includes('whale') || lower.includes('large transaction') || lower.includes('whale alert')) {
      if (this.whaleAgent) {
        const recent = this.whaleAgent.recentWhales || [];
        if (recent.length > 0) {
          const top = recent.slice(0, 3);
          const list = top.map(w => `${w.amount} ${w.symbol} ($${(w.usdValue/1e6).toFixed(1)}M)`).join('\n');
          const latest = top[0];
          let explanation = '';
          if (this.openai) {
            try {
              const prompt = `Explain this whale transaction: ${latest.amount} ${latest.symbol} worth $${(latest.usdValue/1e6).toFixed(1)}M. What does it mean for the market? (1 sentence)`;
              const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50,
                temperature: 0.7,
              });
              explanation = response.choices[0].message.content.trim();
            } catch (err) { /* ignore */ }
          }
          return `Recent whale movements:\n${list}\n\n${explanation || 'A large whale transaction just occurred!'}`;
        }
      }
      return "No recent whale transactions detected.";
    }

    // Signals
    if (lower.includes('signal') || lower.includes('buy') || lower.includes('sell') || lower.includes('trade')) {
      if (this.signalAgent) {
        const signals = Array.from(this.signalAgent.lastSignal.entries()).slice(0, 3);
        if (signals.length > 0) {
          const list = signals.map(([key, time]) => {
            const [coin, action] = key.split('_');
            const ago = Math.floor((Date.now() - time) / 60000);
            return `${coin}: ${action} (${ago} min ago)`;
          }).join('\n');
          let explanation = '';
          if (this.openai) {
            try {
              const prompt = `Summarize these trading signals:\n${list}\nProvide a brief market insight.`;
              const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 60,
                temperature: 0.7,
              });
              explanation = response.choices[0].message.content.trim();
            } catch (err) { /* ignore */ }
          }
          return `Recent signals:\n${list}\n\n${explanation || 'Check your signal channels for more details.'}`;
        }
      }
      return "No trading signals available at the moment.";
    }

    // Token Analytics
    if (lower.includes('holders') || lower.includes('distribution') || lower.includes('liquidity') || lower.includes('token info')) {
      const tokenMatch = lower.match(/\b(btc|eth|sol|usdt|usdc|dai|uni|link)\b/i);
      if (tokenMatch) {
        const token = tokenMatch[0].toUpperCase();
        try {
          const url = `https://api.coingecko.com/api/v3/coins/${token.toLowerCase()}`;
          const response = await axios.get(url, { params: { localization: false, tickers: false, market_data: true, community_data: true }, timeout: 8000 });
          const data = response.data;
          const marketData = data.market_data;
          const supply = marketData.total_supply || 'N/A';
          const holders = marketData.circulating_supply ? Math.floor(marketData.circulating_supply / 1000) : 'N/A';
          const liquidity = marketData.total_volume?.usd || 'N/A';
          return `📊 **${token} Analytics**\n• Total Supply: ${supply}\n• Holders: ~${holders}\n• 24h Volume: $${liquidity}\n• Market Cap: $${(marketData.market_cap?.usd/1e9).toFixed(2)}B`;
        } catch (err) {
          return `Could not fetch analytics for ${token}.`;
        }
      }
    }

    // Daily Market Summary
    if (lower.includes('summary') || lower.includes('recap') || lower.includes('daily')) {
      let summary = "📊 **Daily Market Recap**\n\n";
      const coins = ['BTC', 'ETH', 'SOL'];
      for (const coin of coins) {
        try {
          const price = await this.priceAgent?.fetchPrice(coin.toLowerCase());
          if (price) {
            summary += `• ${coin}: $${price.usd.toFixed(2)} (${price.change24h?.toFixed(1)}%)\n`;
          }
        } catch (err) { /* ignore */ }
      }
      const signals = this.signalAgent?.lastSignal?.size || 0;
      summary += `\n📈 Signals: ${signals} recent signals.\n`;
      const whales = this.whaleAgent?.recentWhales?.length || 0;
      summary += `🐋 Whales: ${whales} whale transactions detected.\n`;
      let polish = '';
      if (this.openai) {
        try {
          const prompt = `Write a short, engaging summary of today's crypto market based on these stats:\n${summary}\nKeep it 1-2 sentences.`;
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 60,
            temperature: 0.7,
          });
          polish = response.choices[0].message.content.trim();
        } catch (err) { /* ignore */ }
      }
      if (polish) summary += `\n\n${polish}`;
      return summary;
    }

    // Knowledge Base Query
    if (lower.includes('docs') || lower.includes('documentation') || lower.includes('whitepaper') || lower.includes('tokenomics')) {
      if (guildId) {
        const kbResult = await this.queryKnowledgeBase(query, guildId);
        if (kbResult) {
          return `📚 From our knowledge base:\n\n${kbResult}`;
        }
      }
    }

    // Security / Scam
    if (lower.includes('scam') || lower.includes('rug') || lower.includes('honeypot') || lower.includes('fake token')) {
      return "🛡️ **Security Advisory**: Always verify contract addresses, check liquidity locks, and use reputable sources. If you suspect a scam, report it to moderators immediately.";
    }

    // Personalised response (watchlist)
    if (userId && guildId) {
      const prefs = this._prefsCache.get(`${userId}_${guildId}`);
      if (prefs && prefs.watchCoins.length > 0) {
        for (const coin of prefs.watchCoins) {
          if (lower.includes(coin.toLowerCase())) {
            const priceResult = await this.executeTool(`price ${coin}`, userId, guildId);
            return `🔔 *You watch ${coin}.* ${priceResult || ''}`;
          }
        }
      }
    }

    return null;
  }

  // ---------- AI Call (enhanced) ----------
  async askAI(userId, guildId, prompt, config, systemPromptOverride = null) {
    if (!this.openai && !this.useGemini) return '❌ AI service is not configured (missing API keys).';
    if (this.blacklist.has(userId)) return '❌ You have been blocked from using AI features. Contact an admin if this is a mistake.';
    if (!(await this.checkTokenQuota(userId, guildId, config))) return '⚠️ You have exceeded your monthly token quota. Please wait until next month or contact an admin.';

    // Execute tool
    let toolResult = null;
    if (config.enableToolIntegration) {
      toolResult = await this.executeTool(prompt, userId, guildId);
    }
    let toolContext = toolResult ? `\n\nContext: ${toolResult}` : '';

    // Knowledge Base context
    let kbContext = '';
    try {
      const kbDocs = await this.queryKnowledgeBase(prompt, guildId, 2);
      if (kbDocs) kbContext = `\n\nRelevant documentation:\n${kbDocs}`;
    } catch (err) { /* ignore */ }

    // User preferences context
    let prefsContext = '';
    const prefs = this._prefsCache.get(`${userId}_${guildId}`);
    if (prefs && prefs.watchCoins.length > 0) {
      prefsContext = `\n\nUser's watchlist: ${prefs.watchCoins.join(', ')}.`;
    }

    const finalPrompt = prompt + kbContext + prefsContext + toolContext;

    // Build messages
    const system = systemPromptOverride || config.systemPrompt;
    let messages = [{ role: 'system', content: system }];
    const history = await this.getMemory(userId, guildId, config.memoryTimeoutMinutes);
    if (history) messages.push(...history);
    messages.push({ role: 'user', content: finalPrompt });

    // Summarize if too long
    messages = await this.summarizeMemory(userId, guildId, messages);

    // Model selection
    const isComplex = prompt.length > 100 || /analyze|explain|detailed|strategy|technical/i.test(prompt);
    const model = isComplex ? (config.model || 'gpt-3.5-turbo') : 'gpt-3.5-turbo';

    let reply = null, tokensUsed = 0, provider = 'none';
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        if (this.openai) {
          const response = await this.openai.chat.completions.create({
            model: model,
            messages,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            stream: false,
          });
          reply = response.choices[0].message.content;
          tokensUsed = response.usage.total_tokens;
          provider = 'openai';
          break;
        } else if (this.useGemini) {
          const modelGemini = this.genAI.getGenerativeModel({ model: this.geminiModel });
          const chat = modelGemini.startChat({
            history: history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
            generationConfig: { maxOutputTokens: config.maxTokens, temperature: config.temperature },
          });
          const result = await chat.sendMessage(finalPrompt);
          reply = result.response.text();
          tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
          provider = 'gemini';
          break;
        }
      } catch (err) {
        attempt++;
        const wait = 1000 * Math.pow(2, attempt);
        this.logger.warn(`AI attempt ${attempt} failed: ${err.message}, retrying in ${wait}ms`);
        if (attempt >= maxRetries) {
          reply = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
          provider = 'fallback';
          break;
        }
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }

    if (!reply) {
      reply = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
      provider = 'fallback';
    }

    if (tokensUsed > 0) await this.trackTokenUsage(userId, guildId, tokensUsed);
    if (!this.fallbackResponses.includes(reply)) {
      await this.updateMemory(userId, guildId, prompt, reply);
    }
    await this._logInteraction(userId, guildId, prompt, reply, tokensUsed, provider);
    return reply;
  }

  // ---------- Multimodal ----------
  async analyzeImage(userId, guildId, imageUrl, prompt, config) {
    if (!this.openai) return '❌ Image analysis requires OpenAI API key.';
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: [{ type: 'text', text: prompt || 'What is in this image?' }, { type: 'image_url', image_url: { url: imageUrl } }] },
        ],
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      });
      return response.choices[0].message.content;
    } catch (err) {
      this.logger.error(`Image analysis failed: ${err.message}`);
      return '❌ Failed to analyse image.';
    }
  }

  // ---------- Feedback ----------
  async storeFeedback(userId, guildId, prompt, response, feedback) {
    const db = this.deps.db;
    await db.run(
      `INSERT INTO ai_feedback (userId, guildId, prompt, response, feedback, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, guildId, prompt, response, feedback, Date.now()]
    );
  }

  // ---------- Admin Logging ----------
  async _logInteraction(userId, guildId, prompt, response, tokens, provider) {
    if (!this.adminLogWebhook) return;
    try {
      const embed = {
        title: '📋 AI Interaction',
        color: 0x3498db,
        fields: [
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Guild', value: guildId, inline: true },
          { name: 'Provider', value: provider, inline: true },
          { name: 'Tokens', value: tokens.toString(), inline: true },
          { name: 'Prompt', value: prompt.slice(0, 500), inline: false },
          { name: 'Response', value: response.slice(0, 500), inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      await axios.post(this.adminLogWebhook, { embeds: [embed] }, { timeout: 5000 });
    } catch (err) { /* ignore */ }
  }

  // ---------- Helper: Generate Image ----------
  async generateImage(prompt) {
    if (!this.openai) return null;
    try {
      const response = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
      });
      return response.data[0].url;
    } catch (err) {
      this.logger.error(`Image generation error: ${err.message}`);
      return null;
    }
  }

  // ---------- Helper: Sentiment ----------
  async analyzeSentiment(text) {
    let result = 'unknown';
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: 'Analyze sentiment. Respond with exactly one word: positive, negative, or neutral.' }, { role: 'user', content: text }],
          max_tokens: 10,
          temperature: 0,
        });
        result = response.choices[0].message.content.toLowerCase();
        return result;
      } catch (err) { /* ignore */ }
    }
    if (this.useGemini) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `Analyze sentiment. Respond with exactly one word: positive, negative, or neutral. Text: ${text}` }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        });
        result = geminiResult.response.text().toLowerCase();
        return result;
      } catch (err) { /* ignore */ }
    }
    return result;
  }

  // ---------- SLASH COMMANDS: Consolidated /ai (with Group Support) ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'ai') return;

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const config = await this.getGuildConfig(interaction.guild.id);

    // Handle groups first
    if (group === 'kb') {
      await this.cmdKb(interaction);
      return;
    }
    if (group === 'preferences') {
      await this.cmdPreferences(interaction);
      return;
    }
    if (group === 'config') {
      await this.cmdConfig(interaction, config);
      return;
    }

    // Handle top-level subcommands
    switch (sub) {
      case 'ask':
        await this.cmdAsk(interaction, config);
        break;
      case 'askimage':
        await this.cmdAskImage(interaction, config);
        break;
      case 'reset':
        await this.cmdReset(interaction);
        break;
      case 'sentiment':
        await this.cmdSentiment(interaction);
        break;
      case 'imagine':
        await this.cmdImagine(interaction);
        break;
      case 'stats':
        await this.cmdStats(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ---------- Subcommand Handlers ----------

  // /ai ask
  async cmdAsk(interaction, config) {
    await interaction.deferReply();
    await interaction.channel.sendTyping();
    const prompt = interaction.options.getString('prompt');
    const systemOverride = interaction.options.getString('system') || null;

    // Cache check
    const cacheKey = `${interaction.user.id}_${prompt}`;
    if (this.answerCache.has(cacheKey)) {
      const cached = this.answerCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(cached.answer + '\n\n*(cached response)*')
          .setColor(0x00ae86)
          .setFooter({ text: 'AI response • cached' });
        await interaction.editReply({ embeds: [embed] });
        return;
      } else {
        this.answerCache.delete(cacheKey);
      }
    }

    const reply = await this.askAI(interaction.user.id, interaction.guild.id, prompt, config, systemOverride);
    this.answerCache.set(cacheKey, { answer: reply, timestamp: Date.now() });

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(reply)
      .setColor(0x00ae86)
      .setFooter({ text: 'AI response • use /ai reset to clear context' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ai_like_${interaction.id}`).setLabel('👍').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ai_dislike_${interaction.id}`).setLabel('👎').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });
    this._feedbackMap.set(msg.id, { userId: interaction.user.id, guildId: interaction.guild.id, prompt, response: reply });
  }

  // /ai askimage
  async cmdAskImage(interaction, config) {
    if (!config.enableMultimodal) {
      return interaction.reply({ content: '❌ Image analysis is disabled in this server.', ephemeral: true });
    }
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('image');
    const prompt = interaction.options.getString('prompt') || 'Describe this image in detail.';
    if (!attachment || !attachment.url) {
      return interaction.editReply('❌ Please attach an image.');
    }
    const result = await this.analyzeImage(interaction.user.id, interaction.guild.id, attachment.url, prompt, config);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(result)
      .setColor(0x9b59b6)
      .setImage(attachment.url)
      .setFooter({ text: 'AI image analysis' });
    await interaction.editReply({ embeds: [embed] });
  }

  // /ai reset
  async cmdReset(interaction) {
    await this.clearMemory(interaction.user.id, interaction.guild.id);
    await interaction.reply({ content: '✅ Conversation context reset.', ephemeral: true });
  }

  // /ai sentiment
  async cmdSentiment(interaction) {
    const text = interaction.options.getString('text');
    const sentiment = await this.analyzeSentiment(text);
    const emoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😠' : '😐';
    await interaction.reply({ content: `${emoji} Sentiment: **${sentiment}**`, ephemeral: true });
  }

  // /ai imagine
  async cmdImagine(interaction) {
    if (!this.openai) {
      return interaction.reply({ content: '❌ Image generation unavailable (requires OpenAI API key).', ephemeral: true });
    }
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const url = await this.generateImage(prompt);
    if (!url) return interaction.editReply('❌ Failed to generate image.');
    const embed = new EmbedBuilder()
      .setTitle('🎨 Generated Image')
      .setDescription(`Prompt: ${prompt}`)
      .setImage(url)
      .setColor(0x9b59b6);
    await interaction.editReply({ embeds: [embed] });
  }

  // /ai stats
  async cmdStats(interaction) {
    const config = await this.getGuildConfig(interaction.guild.id);
    const convCount = (await this.deps.db.get(`SELECT COUNT(DISTINCT userId) as count FROM ai_conversations WHERE guildId = ?`, [interaction.guild.id]))?.count || 0;
    const providers = [];
    if (this.openai) providers.push('OpenAI');
    if (this.useGemini) providers.push('Gemini');

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Agent Stats')
      .setColor(0x3498db)
      .addFields(
        { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
        { name: 'Providers', value: providers.length ? providers.join(' + ') : 'None', inline: true },
        { name: 'Model', value: config.model, inline: true },
        { name: 'Active conversations', value: convCount.toString(), inline: true },
        { name: 'Rate limit (per min)', value: config.rateLimitPerUser.toString(), inline: true },
        { name: 'Whitelisted channels', value: config.channelWhitelist.length.toString(), inline: true },
        { name: 'OpenAI Key', value: this.openaiApiKey ? '✅ Set' : '❌ Missing', inline: true },
        { name: 'Gemini Key', value: this.useGemini ? '✅ Set' : '❌ Missing', inline: true },
        { name: 'VIP/Premium only', value: config.requireSubscription ? 'Yes' : 'No', inline: true },
        { name: 'Token Quota', value: config.tokenQuota.toString(), inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /ai kb
  async cmdKb(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    if (sub === 'add') {
      const content = interaction.options.getString('content');
      const metadata = { guildId, addedBy: interaction.user.id };
      const id = await this.addDocument(guildId, content, metadata);
      await interaction.reply({ content: `✅ Document added with ID: ${id}`, ephemeral: true });
    } else if (sub === 'query') {
      const query = interaction.options.getString('query');
      const docs = await this.queryKnowledgeBase(query, guildId);
      if (docs) {
        const embed = new EmbedBuilder()
          .setTitle('📚 Knowledge Base Results')
          .setDescription(docs)
          .setColor(0x3498db);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ content: 'No relevant documents found.', ephemeral: true });
      }
    } else if (sub === 'list') {
      const db = this.deps.db;
      const rows = await db.all(`SELECT id, metadata FROM ai_kb_documents WHERE guildId = ?`, [guildId]);
      if (rows.length === 0) return interaction.reply({ content: 'No documents in knowledge base.', ephemeral: true });
      let desc = '';
      for (const row of rows) {
        const meta = JSON.parse(row.metadata);
        desc += `• ID: ${row.id} – added by <@${meta.addedBy}>\n`;
      }
      const embed = new EmbedBuilder().setTitle('📚 Knowledge Base').setDescription(desc).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // /ai preferences
  async cmdPreferences(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    if (sub === 'watch') {
      const action = interaction.options.getString('action');
      const coin = interaction.options.getString('coin').toUpperCase();
      let prefs = this._prefsCache.get(`${userId}_${guildId}`) || { watchCoins: [], expertise: 'beginner', notificationPrefs: 'all' };
      if (action === 'add') {
        if (!prefs.watchCoins.includes(coin)) {
          prefs.watchCoins.push(coin);
          await db.run(
            `INSERT OR REPLACE INTO ai_user_prefs (userId, guildId, watchCoins, expertise, notificationPrefs) VALUES (?, ?, ?, ?, ?)`,
            [userId, guildId, prefs.watchCoins.join(','), prefs.expertise, prefs.notificationPrefs]
          );
          this._prefsCache.set(`${userId}_${guildId}`, prefs);
          await interaction.reply({ content: `✅ Added ${coin} to your watchlist.`, ephemeral: true });
        } else {
          await interaction.reply({ content: `You already watch ${coin}.`, ephemeral: true });
        }
      } else {
        prefs.watchCoins = prefs.watchCoins.filter(c => c !== coin);
        await db.run(
          `INSERT OR REPLACE INTO ai_user_prefs (userId, guildId, watchCoins, expertise, notificationPrefs) VALUES (?, ?, ?, ?, ?)`,
          [userId, guildId, prefs.watchCoins.join(','), prefs.expertise, prefs.notificationPrefs]
        );
        this._prefsCache.set(`${userId}_${guildId}`, prefs);
        await interaction.reply({ content: `✅ Removed ${coin} from your watchlist.`, ephemeral: true });
      }
    } else if (sub === 'setexpertise') {
      const expertise = interaction.options.getString('level');
      let prefs = this._prefsCache.get(`${userId}_${guildId}`) || { watchCoins: [], expertise: 'beginner', notificationPrefs: 'all' };
      prefs.expertise = expertise;
      await db.run(
        `INSERT OR REPLACE INTO ai_user_prefs (userId, guildId, watchCoins, expertise, notificationPrefs) VALUES (?, ?, ?, ?, ?)`,
        [userId, guildId, prefs.watchCoins.join(','), prefs.expertise, prefs.notificationPrefs]
      );
      this._prefsCache.set(`${userId}_${guildId}`, prefs);
      await interaction.reply({ content: `✅ Expertise level set to ${expertise}.`, ephemeral: true });
    }
  }

  // /ai config (admin)
  async cmdConfig(interaction, config) {
    if (!interaction.member.permissions.has('Administrator')) return this.deny(interaction);
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'enable':
        await this.updateGuildConfig(interaction.guild.id, { enabled: true });
        await interaction.reply({ content: '✅ AI features enabled globally.', ephemeral: true });
        break;
      case 'disable':
        await this.updateGuildConfig(interaction.guild.id, { enabled: false });
        await interaction.reply({ content: '❌ AI features disabled globally.', ephemeral: true });
        break;
      case 'channel':
        const action = interaction.options.getString('action');
        const channel = interaction.options.getChannel('channel');
        let whitelist = config.channelWhitelist || [];
        if (action === 'add') {
          if (!whitelist.includes(channel.id)) whitelist.push(channel.id);
          await this.updateGuildConfig(interaction.guild.id, { channelWhitelist: whitelist });
          await interaction.reply({ content: `✅ Added ${channel} to AI whitelist.`, ephemeral: true });
        } else {
          whitelist = whitelist.filter(id => id !== channel.id);
          await this.updateGuildConfig(interaction.guild.id, { channelWhitelist: whitelist });
          await interaction.reply({ content: `✅ Removed ${channel} from AI whitelist.`, ephemeral: true });
        }
        break;
      case 'model':
        const model = interaction.options.getString('model');
        await this.updateGuildConfig(interaction.guild.id, { model });
        await interaction.reply({ content: `✅ AI model set to ${model}.`, ephemeral: true });
        break;
      case 'system':
        const sysPrompt = interaction.options.getString('prompt');
        await this.updateGuildConfig(interaction.guild.id, { systemPrompt: sysPrompt });
        await interaction.reply({ content: '✅ System prompt updated.', ephemeral: true });
        break;
      case 'block':
        const user = interaction.options.getUser('user');
        await this._addBlacklist(user.id, interaction.guild.id, interaction.options.getString('reason') || 'No reason');
        await interaction.reply({ content: `✅ ${user.tag} blocked from AI.`, ephemeral: true });
        break;
      case 'unblock':
        const user2 = interaction.options.getUser('user');
        await this._removeBlacklist(user2.id);
        await interaction.reply({ content: `✅ ${user2.tag} unblocked.`, ephemeral: true });
        break;
      case 'setquota':
        const quota = interaction.options.getInteger('quota');
        await this.updateGuildConfig(interaction.guild.id, { tokenQuota: quota });
        await interaction.reply({ content: `✅ Monthly token quota set to ${quota}.`, ephemeral: true });
        break;
    }
  }

  // ---------- Button Feedback ----------
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    const { customId } = interaction;
    if (customId.startsWith('ai_like_')) {
      const msgId = customId.replace('ai_like_', '');
      const data = this._feedbackMap.get(msgId);
      if (!data) return interaction.reply({ content: '❌ Feedback could not be processed.', ephemeral: true });
      await this.storeFeedback(data.userId, data.guildId, data.prompt, data.response, 1);
      await interaction.reply({ content: '✅ Thank you for your feedback!', ephemeral: true });
    } else if (customId.startsWith('ai_dislike_')) {
      const msgId = customId.replace('ai_dislike_', '');
      const data = this._feedbackMap.get(msgId);
      if (!data) return interaction.reply({ content: '❌ Feedback could not be processed.', ephemeral: true });
      await this.storeFeedback(data.userId, data.guildId, data.prompt, data.response, -1);
      await interaction.reply({ content: '✅ Thank you for your feedback!', ephemeral: true });
    }
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }

  // ---------- Cleanup ----------
  async destroy() {
    this.answerCache.clear();
    if (this._feedbackMap) this._feedbackMap.clear();
    await super.destroy();
  }
}

module.exports = AiChatAgent;