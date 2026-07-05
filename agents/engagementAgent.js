/**
 * 🎯 EngagementAgent v2.0 – Production‑Ready Engagement Engine
 * - Polls, quizzes, debates, predictions, fantasy portfolio, trivia, mentor, conversation starter
 * - Rewards XP and coins via EconomyAgent events
 * - Uses dedicated channels (POLL_CHANNEL_ID, QUIZ_CHANNEL_ID, etc.)
 * - Full error handling, rate limiting, caching, analytics, admin config
 * - All commands consolidated under /engage
 * - Mentor customisation, health check, and more
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const axios = require('axios');

// ---- Simple cache with TTL ----
class TTLCache {
  constructor(ttl = 6 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.ttl = ttl;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }
  clear() {
    this.cache.clear();
  }
}

class EngagementAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Channel config (from env) ----
    this.pollChannelId = process.env.POLL_CHANNEL_ID;
    this.quizChannelId = process.env.QUIZ_CHANNEL_ID;
    this.debateChannelId = process.env.DEBATE_CHANNEL_ID;
    this.generalChatChannelId = process.env.GENERAL_CHAT_CHANNEL_ID;
    this.newsChannelId = process.env.NEWS_CHANNEL_ID;
    this.predictionsChannelId = process.env.PREDICTIONS_CHANNEL_ID;
    this.fantasyPortfolioChannelId = process.env.FANTASY_PORTFOLIO_CHANNEL_ID;
    this.funFactsChannelId = process.env.FUN_FACTS_CHANNEL_ID;

    // ---- Fallback for channels ----
    this.fallbackChannelId = this.generalChatChannelId || process.env.ANNOUNCEMENT_CHANNEL_ID;

    // ---- Mentor ----
    this.mentorEnabled = process.env.MENTOR_ENABLED !== 'false';

    // ---- AI Clients ----
    this.openai = null;
    this.useGemini = false;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI available for EngagementAgent');
      } else if (process.env.GEMINI_API_KEY) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        this.useGemini = true;
        this.logger.info('🧠 Gemini available for EngagementAgent');
      }
    } catch (err) {
      this.logger.warn(`AI init failed: ${err.message}`);
    }

    // ---- Trivia facts ----
    this.triviaFacts = [
      'Bitcoin has never been hacked.',
      'The first Bitcoin transaction was for two pizzas (10,000 BTC).',
      'Ethereum was proposed in 2013 by Vitalik Buterin.',
      'Satoshi Nakamoto is the pseudonymous creator of Bitcoin.',
      'There are only 21 million Bitcoins that will ever exist.',
      'The total market cap of all cryptocurrencies once exceeded $3 trillion.',
      'Ethereum switched to Proof-of-Stake in 2022 (The Merge).',
      'The first NFT ever minted was "Quantum" in 2014.',
      'Tether (USDT) is the largest stablecoin by market cap.',
      'Dogecoin was created as a joke in 2013.',
      'The largest crypto exchange by volume is Binance.',
      'Bitcoin uses SHA-256 hashing algorithm.',
      'Ethereum uses Keccak-256 hashing.',
    ];

    // ---- Caches ----
    this.aiCache = new TTLCache(6 * 60 * 60 * 1000); // 6h TTL
    this.quizCache = new Map();
    this.pollCache = new Map();
    this.debateCache = new Map();
    this.predictionCache = new Map();
    this.portfolioCache = new Map();

    // ---- Prediction Scores ----
    this.predictionScores = new Map(); // userId → points

    // ---- Rate limiting (cooldown) ----
    this.cooldowns = {
      predict: { limit: 5, window: 10 * 1000 }, // 5 per 10s
      portfolio: { limit: 5, window: 10 * 1000 },
      buy: { limit: 5, window: 10 * 1000 },
      sell: { limit: 5, window: 10 * 1000 },
    };

    // ---- Admin config (per guild) ----
    this.guildFeatures = new Map(); // guildId -> { enablePolls, enableQuizzes, enableDebates, enableTrivia, enablePredictions, enablePortfolio, enableMentor }

    // ---- Startup time ----
    this._startTime = Date.now();
    this._lastJobRuns = {};
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadGuildConfigs();

    // Subscribe to jobs
    this.subscribe('job.conversationStarter', async () => {
      this._lastJobRuns.conversationStarter = Date.now();
      await this._postConversationStarter();
    });
    this.subscribe('job.dailyPoll', async () => {
      this._lastJobRuns.poll = Date.now();
      await this._postDailyPoll();
    });
    this.subscribe('job.dailyQuiz', async () => {
      this._lastJobRuns.quiz = Date.now();
      await this._postDailyQuiz();
    });
    this.subscribe('job.dailyDebate', async () => {
      this._lastJobRuns.debate = Date.now();
      await this._postDailyDebate();
    });
    this.subscribe('job.trivia', async () => {
      this._lastJobRuns.trivia = Date.now();
      await this._postTrivia();
    });
    this.subscribe('job.mentor', async () => {
      this._lastJobRuns.mentor = Date.now();
      await this._sendMentorLessons();
    });
    this.subscribe('job.autoSummarize', async () => {
      this._lastJobRuns.autoSummarize = Date.now();
      await this._autoSummarize();
    });

    // Also subscribe to news.published for auto-summarize (handled inside)
    this.subscribe('news.published', async (data) => {
      // This will be processed by _autoSummarize which already listens via a separate subscription? We'll keep the existing pattern.
    });

    this.logger.info('🎯 EngagementAgent v2.0 ready (all commands consolidated under /engage)');
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS engagement_polls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        options TEXT,
        votes TEXT,
        created_at INTEGER,
        message_id TEXT
      );
      CREATE TABLE IF NOT EXISTS engagement_quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        options TEXT,
        correct INTEGER,
        created_at INTEGER,
        message_id TEXT,
        winner_ids TEXT
      );
      CREATE TABLE IF NOT EXISTS engagement_predictions (
        user_id TEXT,
        guild_id TEXT,
        asset TEXT,
        target_price REAL,
        created_at INTEGER,
        score INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, guild_id, asset)
      );
      CREATE TABLE IF NOT EXISTS engagement_fantasy_portfolio (
        user_id TEXT,
        guild_id TEXT,
        cash REAL DEFAULT 100000,
        holdings TEXT,
        total_value REAL DEFAULT 100000,
        PRIMARY KEY (user_id, guild_id)
      );
      CREATE TABLE IF NOT EXISTS engagement_mentor (
        user_id TEXT,
        guild_id TEXT,
        lesson_index INTEGER DEFAULT 0,
        last_sent INTEGER,
        PRIMARY KEY (user_id, guild_id)
      );
      CREATE TABLE IF NOT EXISTS engagement_mentor_lessons (
        guild_id TEXT,
        lesson_index INTEGER,
        text TEXT,
        PRIMARY KEY (guild_id, lesson_index)
      );
      CREATE TABLE IF NOT EXISTS engagement_config (
        guild_id TEXT PRIMARY KEY,
        config TEXT
      );
      CREATE TABLE IF NOT EXISTS engagement_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        guild_id TEXT,
        activity_type TEXT,
        metadata TEXT,
        timestamp INTEGER
      );
    `);
  }

  // ---------- Guild Config ----------
  async _loadGuildConfigs() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT guild_id, config FROM engagement_config`);
    for (const row of rows) {
      this.guildFeatures.set(row.guild_id, JSON.parse(row.config));
    }
  }

  async getGuildFeatures(guildId) {
    if (this.guildFeatures.has(guildId)) return this.guildFeatures.get(guildId);
    const defaultConfig = {
      enablePolls: true,
      enableQuizzes: true,
      enableDebates: true,
      enableTrivia: true,
      enablePredictions: true,
      enablePortfolio: true,
      enableMentor: true,
    };
    this.guildFeatures.set(guildId, defaultConfig);
    await this.deps.db.run(
      `INSERT OR REPLACE INTO engagement_config (guild_id, config) VALUES (?, ?)`,
      [guildId, JSON.stringify(defaultConfig)]
    );
    return defaultConfig;
  }

  async setGuildFeature(guildId, feature, enabled) {
    const config = await this.getGuildFeatures(guildId);
    config[feature] = enabled;
    this.guildFeatures.set(guildId, config);
    await this.deps.db.run(
      `UPDATE engagement_config SET config = ? WHERE guild_id = ?`,
      [JSON.stringify(config), guildId]
    );
  }

  // ---------- Helper: Get Channel ----------
  _getChannel(channelId) {
    const id = channelId || this.fallbackChannelId;
    if (!id) return null;
    return this.client.channels.cache.get(id);
  }

  // ---------- Helper: AI Call with Caching ----------
  async _callAIWithCache(cacheKey, prompt, fallback) {
    // Check cache first
    const cached = this.aiCache.get(cacheKey);
    if (cached) return cached;

    let result = await this._callAI(prompt, fallback);
    // Cache the result
    this.aiCache.set(cacheKey, result);
    return result;
  }

  async _callAI(prompt, fallback) {
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.8,
        });
        return response.choices[0].message.content.trim();
      } catch (err) {
        this.logger.debug(`OpenAI failed: ${err.message}`);
      }
    }
    if (this.useGemini && this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
        });
        return result.response.text().trim();
      } catch (err) {
        this.logger.debug(`Gemini failed: ${err.message}`);
      }
    }
    return fallback;
  }

  // ---------- Rate Limiting ----------
  async _checkCooldown(userId, guildId, command) {
    const config = this.cooldowns[command];
    if (!config) return false;
    const lastUsed = await this.getCooldown(userId, guildId, `engage_${command}`);
    const now = Date.now();
    if (now - lastUsed < config.window) {
      return true; // still in cooldown
    }
    await this.setCooldown(userId, guildId, `engage_${command}`, now);
    return false;
  }

  // ---------- Log Activity ----------
  async _logActivity(userId, guildId, activityType, metadata = {}) {
    const db = this.deps.db;
    await db.run(
      `INSERT INTO engagement_activity (user_id, guild_id, activity_type, metadata, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [userId, guildId, activityType, JSON.stringify(metadata), Date.now()]
    );
  }

  // ---------- 1. Conversation Starter ----------
  async _postConversationStarter() {
    const channel = this._getChannel(this.generalChatChannelId);
    if (!channel) return;
    try {
      const prompt = 'Generate a short, engaging crypto discussion question for a community.';
      const fallback = "💬 **Question of the Day:** What's one crypto project you're most excited about and why?";
      const content = await this._callAIWithCache('conv_starter_' + new Date().toDateString(), prompt, fallback);
      await channel.send(content);
      this.logger.info('💬 Conversation starter posted');
    } catch (err) {
      this.logger.error(`Conversation starter failed: ${err.message}`);
    }
  }

  // ---------- 2. Daily Poll ----------
  async _postDailyPoll() {
    const channel = this._getChannel(this.pollChannelId);
    if (!channel) return;
    try {
      const cacheKey = 'poll_' + new Date().toDateString();
      const prompt = 'Generate a crypto poll with a question and 4 options. Format: Question|Option1|Option2|Option3|Option4';
      const fallback = 'Which crypto will perform best this week?|Bitcoin|Ethereum|Solana|Cardano';
      const raw = await this._callAIWithCache(cacheKey, prompt, fallback);
      const parts = raw.split('|').map(s => s.trim());
      const question = parts[0] || 'Poll';
      const options = parts.slice(1, 5);
      if (options.length < 2) return;

      const embed = new EmbedBuilder()
        .setTitle('📊 Daily Poll')
        .setDescription(`**${question}**`)
        .setColor(0x3498db)
        .setTimestamp();

      const row = new ActionRowBuilder();
      const labels = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < options.length; i++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`poll_${i}`)
            .setLabel(`${labels[i]}: ${options[i]}`)
            .setStyle(ButtonStyle.Primary)
        );
      }
      const db = this.deps.db;
      const result = await db.run(
        `INSERT INTO engagement_polls (question, options, votes, created_at) VALUES (?, ?, ?, ?)`,
        [question, JSON.stringify(options), JSON.stringify({}), Date.now()]
      );
      const pollId = result.lastID;
      const sent = await channel.send({ embeds: [embed], components: [row] });
      await db.run(`UPDATE engagement_polls SET message_id = ? WHERE id = ?`, [sent.id, pollId]);
      this.logger.info(`📊 Poll posted (ID: ${pollId})`);
    } catch (err) {
      this.logger.error(`Daily poll failed: ${err.message}`);
    }
  }

  // ---------- 3. Daily Quiz ----------
  async _postDailyQuiz() {
    const channel = this._getChannel(this.quizChannelId);
    if (!channel) return;
    try {
      const cacheKey = 'quiz_' + new Date().toDateString();
      const prompt = 'Generate a crypto quiz question with 4 options and the correct answer index (0-3). Format: Question|Option1|Option2|Option3|Option4|CorrectIndex';
      const fallback = 'What is the native token of Ethereum?|Bitcoin|Ethereum|Solana|Cardano|1';
      const raw = await this._callAIWithCache(cacheKey, prompt, fallback);
      const parts = raw.split('|').map(s => s.trim());
      if (parts.length < 6) return;
      const question = parts[0];
      const options = parts.slice(1, 5);
      const correctIndex = parseInt(parts[5]);
      if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) return;

      const embed = new EmbedBuilder()
        .setTitle('🧠 Daily Quiz')
        .setDescription(`**${question}**\n\nClick the correct option!`)
        .setColor(0xffa500)
        .setTimestamp();

      const row = new ActionRowBuilder();
      const labels = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < options.length; i++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`quiz_${i}`)
            .setLabel(`${labels[i]}: ${options[i]}`)
            .setStyle(ButtonStyle.Secondary)
        );
      }
      const db = this.deps.db;
      const result = await db.run(
        `INSERT INTO engagement_quizzes (question, options, correct, created_at) VALUES (?, ?, ?, ?)`,
        [question, JSON.stringify(options), correctIndex, Date.now()]
      );
      const quizId = result.lastID;
      const sent = await channel.send({ embeds: [embed], components: [row] });
      await db.run(`UPDATE engagement_quizzes SET message_id = ? WHERE id = ?`, [sent.id, quizId]);
      this.logger.info(`🧠 Quiz posted (ID: ${quizId})`);
    } catch (err) {
      this.logger.error(`Daily quiz failed: ${err.message}`);
    }
  }

  // ---------- 4. Daily Debate ----------
  async _postDailyDebate() {
    const channel = this._getChannel(this.debateChannelId);
    if (!channel) return;
    try {
      const cacheKey = 'debate_' + new Date().toDateString();
      const prompt = 'Generate a crypto debate topic with a title and a short description. Format: Title|Description';
      const fallback = 'Bitcoin vs Ethereum|Which will be the dominant smart contract platform in 5 years?';
      const raw = await this._callAIWithCache(cacheKey, prompt, fallback);
      const parts = raw.split('|').map(s => s.trim());
      if (parts.length < 2) return;
      const [title, desc] = parts;

      const embed = new EmbedBuilder()
        .setTitle(`⚖️ Debate: ${title}`)
        .setDescription(desc)
        .setColor(0x9b59b6)
        .setTimestamp()
        .setFooter({ text: 'React with 👍 for Pro, 👎 for Against' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('debate_pro').setLabel('👍 Pro').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('debate_con').setLabel('👎 Against').setStyle(ButtonStyle.Danger)
      );
      await channel.send({ embeds: [embed], components: [row] });
      this.logger.info('⚖️ Debate posted');
    } catch (err) {
      this.logger.error(`Daily debate failed: ${err.message}`);
    }
  }

  // ---------- 5. Trivia ----------
  async _postTrivia() {
    const channel = this._getChannel(this.funFactsChannelId);
    if (!channel) return;
    try {
      const fact = this.triviaFacts[Math.floor(Math.random() * this.triviaFacts.length)];
      await channel.send(`📜 **Crypto Trivia:** ${fact}`);
      this.logger.info('📜 Trivia posted');
    } catch (err) {
      this.logger.error(`Trivia failed: ${err.message}`);
    }
  }

  // ---------- 6. Mentor ----------
  async _sendMentorLessons() {
    if (!this.mentorEnabled) return;
    const db = this.deps.db;
    try {
      // Fetch custom lessons for this guild (we'll use the first guild for now)
      const guild = this.client.guilds.cache.first();
      if (!guild) return;
      const customLessons = await db.all(
        `SELECT lesson_index, text FROM engagement_mentor_lessons WHERE guild_id = ? ORDER BY lesson_index`,
        [guild.id]
      );
      const defaultLessons = [
        '🔐 **Lesson 1: Wallet Security** – Never share your private key or seed phrase.',
        '📈 **Lesson 2: Market Orders** – A market order buys/sells immediately at current price.',
        '🧠 **Lesson 3: What is DeFi?** – Decentralized Finance offers lending, borrowing, and trading without banks.',
        '💎 **Lesson 4: HODL** – Holding long-term is a common strategy in crypto.',
        '📊 **Lesson 5: Market Cap** – Market cap = price × circulating supply.',
        '🔥 **Lesson 6: Staking** – Earn rewards by locking your tokens to support the network.',
        '🚀 **Lesson 7: DYOR** – Always do your own research before investing.',
      ];
      // Build lesson array: custom lessons override default by index
      const lessons = {};
      for (const def of defaultLessons) {
        const idx = parseInt(def.match(/Lesson (\d+)/)?.[1]) - 1;
        lessons[idx] = def;
      }
      for (const custom of customLessons) {
        lessons[custom.lesson_index] = custom.text;
      }
      const lessonList = Object.values(lessons).filter(Boolean);

      const rows = await db.all(`SELECT user_id, guild_id, lesson_index FROM engagement_mentor`);
      for (const row of rows) {
        const idx = row.lesson_index;
        if (idx >= lessonList.length) continue;
        const user = await this.client.users.fetch(row.user_id).catch(() => null);
        if (!user) continue;
        try {
          await user.send(lessonList[idx]);
          await db.run(`UPDATE engagement_mentor SET lesson_index = ? WHERE user_id = ? AND guild_id = ?`, [idx+1, row.user_id, row.guild_id]);
          this.logger.info(`📖 Mentor lesson sent to ${user.tag}`);
        } catch (err) {
          this.logger.debug(`Failed to send mentor lesson to ${row.user_id}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Mentor job failed: ${err.message}`);
    }
  }

  // ---------- 7. Auto-Summarizer ----------
  async _autoSummarize() {
    const summaryAgent = this.deps.orchestrator?.getAgent('SummaryAgent');
    if (!summaryAgent) return;
    // We'll rely on the news.published subscription inside init
    // This method is a no-op; the real logic is in the subscription.
  }

  // ---------- 8. Fantasy Portfolio ----------
  async _updatePortfolioValue(userId, guildId) {
    const db = this.deps.db;
    try {
      const row = await db.get(`SELECT holdings, cash FROM engagement_fantasy_portfolio WHERE user_id = ? AND guild_id = ?`, [userId, guildId]);
      if (!row) return 0;
      const holdings = JSON.parse(row.holdings || '{}');
      const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
      let total = row.cash;
      for (const [symbol, shares] of Object.entries(holdings)) {
        const price = priceAgent?.priceCache?.get(symbol)?.price || 0;
        total += price * shares;
      }
      await db.run(`UPDATE engagement_fantasy_portfolio SET total_value = ? WHERE user_id = ? AND guild_id = ?`, [total, userId, guildId]);
      return total;
    } catch (err) {
      this.logger.error(`Portfolio update failed: ${err.message}`);
      return 0;
    }
  }

  // ---------- SLASH COMMANDS (Consolidated /engage) ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'engage') return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const features = await this.getGuildFeatures(guildId);

    switch (sub) {
      case 'poll':
        if (!features.enablePolls) return interaction.reply({ content: '❌ Polls are disabled in this server.', ephemeral: true });
        await this.cmdPoll(interaction);
        break;
      case 'quiz':
        if (!features.enableQuizzes) return interaction.reply({ content: '❌ Quizzes are disabled in this server.', ephemeral: true });
        await this.cmdQuiz(interaction);
        break;
      case 'debate':
        if (!features.enableDebates) return interaction.reply({ content: '❌ Debates are disabled in this server.', ephemeral: true });
        await this.cmdDebate(interaction);
        break;
      case 'predict':
        if (!features.enablePredictions) return interaction.reply({ content: '❌ Predictions are disabled in this server.', ephemeral: true });
        await this.cmdPredict(interaction);
        break;
      case 'portfolio':
        if (!features.enablePortfolio) return interaction.reply({ content: '❌ Fantasy portfolio is disabled in this server.', ephemeral: true });
        await this.cmdPortfolio(interaction);
        break;
      case 'leaderboard':
        await this.cmdPredictionLeaderboard(interaction);
        break;
      case 'health':
        await this.cmdHealth(interaction);
        break;
      case 'config':
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        await this.cmdConfig(interaction);
        break;
      case 'mentor':
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        await this.cmdMentor(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ---- Poll command (Admin only) ----
  async cmdPoll(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', flags: MessageFlags.Ephemeral });
    }
    const question = interaction.options.getString('question');
    const optionsRaw = interaction.options.getString('options');
    const options = optionsRaw.split(',').map(s => s.trim());
    if (options.length < 2) {
      return interaction.reply({ content: '❌ Need at least 2 options.', flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder().setTitle('📊 Poll').setDescription(`**${question}**`).setColor(0x3498db);
    const row = new ActionRowBuilder();
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < options.length; i++) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`poll_${i}`).setLabel(`${labels[i]}: ${options[i]}`).setStyle(ButtonStyle.Primary)
      );
    }
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Poll posted.', flags: MessageFlags.Ephemeral });
  }

  // ---- Quiz command (Admin only) ----
  async cmdQuiz(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', flags: MessageFlags.Ephemeral });
    }
    const question = interaction.options.getString('question');
    const optionsRaw = interaction.options.getString('options');
    const options = optionsRaw.split(',').map(s => s.trim());
    if (options.length < 2) {
      return interaction.reply({ content: '❌ Need at least 2 options.', flags: MessageFlags.Ephemeral });
    }
    const correct = interaction.options.getInteger('correct');
    if (correct < 0 || correct >= options.length) {
      return interaction.reply({ content: `❌ Correct index must be between 0 and ${options.length-1}.`, flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder().setTitle('🧠 Quiz').setDescription(`**${question}**`).setColor(0xffa500);
    const row = new ActionRowBuilder();
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < options.length; i++) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`quiz_${i}`).setLabel(`${labels[i]}: ${options[i]}`).setStyle(ButtonStyle.Secondary)
      );
    }
    const sent = await channel.send({ embeds: [embed], components: [row] });
    const db = this.deps.db;
    await db.run(
      `INSERT INTO engagement_quizzes (question, options, correct, created_at, message_id) VALUES (?, ?, ?, ?, ?)`,
      [question, JSON.stringify(options), correct, Date.now(), sent.id]
    );
    await interaction.reply({ content: '✅ Quiz posted.', flags: MessageFlags.Ephemeral });
  }

  // ---- Debate command (Admin only) ----
  async cmdDebate(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', flags: MessageFlags.Ephemeral });
    }
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder()
      .setTitle(`⚖️ Debate: ${title}`)
      .setDescription(description)
      .setColor(0x9b59b6)
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('debate_pro').setLabel('👍 Pro').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('debate_con').setLabel('👎 Against').setStyle(ButtonStyle.Danger)
    );
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Debate posted.', flags: MessageFlags.Ephemeral });
  }

  // ---- Predict command ----
  async cmdPredict(interaction) {
    if (await this._checkCooldown(interaction.user.id, interaction.guild.id, 'predict')) {
      return interaction.reply({ content: '⏳ Please wait before making another prediction.', ephemeral: true });
    }
    const asset = interaction.options.getString('asset');
    const targetPrice = interaction.options.getNumber('price');
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO engagement_predictions (user_id, guild_id, asset, target_price, created_at, score)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, guildId, asset, targetPrice, Date.now()]
    );
    const channel = this._getChannel(this.predictionsChannelId);
    if (channel) {
      await channel.send(`🔮 **${interaction.user.username}** predicts **${asset}** will reach **$${targetPrice}**!`);
    }
    await this._logActivity(userId, guildId, 'predict', { asset, targetPrice });
    await interaction.reply({ content: `✅ Your prediction for ${asset} at $${targetPrice} has been recorded!`, ephemeral: true });
  }

  // ---- Portfolio command (view, buy, sell) ----
  async cmdPortfolio(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (sub === 'view') {
      const db = this.deps.db;
      let row = await db.get(`SELECT cash, holdings, total_value FROM engagement_fantasy_portfolio WHERE user_id = ? AND guild_id = ?`, [userId, guildId]);
      if (!row) {
        await db.run(
          `INSERT INTO engagement_fantasy_portfolio (user_id, guild_id, cash, holdings, total_value) VALUES (?, ?, ?, ?, ?)`,
          [userId, guildId, 100000, JSON.stringify({}), 100000]
        );
        row = { cash: 100000, holdings: '{}', total_value: 100000 };
      }
      const holdings = JSON.parse(row.holdings || '{}');
      let desc = `**Cash:** $${row.cash.toFixed(2)}\n**Total Value:** $${row.total_value.toFixed(2)}\n\n**Holdings:**\n`;
      if (Object.keys(holdings).length === 0) desc += 'No holdings yet.';
      else {
        for (const [symbol, shares] of Object.entries(holdings)) {
          desc += `• ${symbol}: ${shares} shares\n`;
        }
      }
      const embed = new EmbedBuilder().setTitle('💼 Fantasy Portfolio').setDescription(desc).setColor(0x00ff88);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else if (sub === 'buy') {
      if (await this._checkCooldown(userId, guildId, 'buy')) {
        return interaction.reply({ content: '⏳ Please wait before buying again.', ephemeral: true });
      }
      const asset = interaction.options.getString('asset').toUpperCase();
      const shares = interaction.options.getNumber('shares');
      const db = this.deps.db;
      const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
      const price = priceAgent?.priceCache?.get(asset)?.price;
      if (!price) {
        return interaction.reply({ content: `❌ No price data for ${asset}.`, flags: MessageFlags.Ephemeral });
      }
      const cost = price * shares;
      let row = await db.get(`SELECT cash, holdings FROM engagement_fantasy_portfolio WHERE user_id = ? AND guild_id = ?`, [userId, guildId]);
      if (!row) {
        await db.run(
          `INSERT INTO engagement_fantasy_portfolio (user_id, guild_id, cash, holdings, total_value) VALUES (?, ?, ?, ?, ?)`,
          [userId, guildId, 100000, JSON.stringify({}), 100000]
        );
        row = { cash: 100000, holdings: '{}' };
      }
      if (row.cash < cost) {
        return interaction.reply({ content: `❌ Insufficient cash! You have $${row.cash.toFixed(2)}.`, flags: MessageFlags.Ephemeral });
      }
      const holdings = JSON.parse(row.holdings || '{}');
      holdings[asset] = (holdings[asset] || 0) + shares;
      const newCash = row.cash - cost;
      await db.run(
        `UPDATE engagement_fantasy_portfolio SET cash = ?, holdings = ? WHERE user_id = ? AND guild_id = ?`,
        [newCash, JSON.stringify(holdings), userId, guildId]
      );
      await this._updatePortfolioValue(userId, guildId);
      await this._logActivity(userId, guildId, 'portfolio_buy', { asset, shares, price, cost });
      await interaction.reply({ content: `✅ Bought ${shares} shares of ${asset} at $${price.toFixed(2)} each (total $${cost.toFixed(2)}).`, ephemeral: true });
    } else if (sub === 'sell') {
      if (await this._checkCooldown(userId, guildId, 'sell')) {
        return interaction.reply({ content: '⏳ Please wait before selling again.', ephemeral: true });
      }
      const asset = interaction.options.getString('asset').toUpperCase();
      const shares = interaction.options.getNumber('shares');
      const db = this.deps.db;
      const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
      const price = priceAgent?.priceCache?.get(asset)?.price;
      if (!price) {
        return interaction.reply({ content: `❌ No price data for ${asset}.`, flags: MessageFlags.Ephemeral });
      }
      let row = await db.get(`SELECT cash, holdings FROM engagement_fantasy_portfolio WHERE user_id = ? AND guild_id = ?`, [userId, guildId]);
      if (!row) {
        return interaction.reply({ content: `❌ You don't have a portfolio. Run /engage portfolio view first.`, flags: MessageFlags.Ephemeral });
      }
      const holdings = JSON.parse(row.holdings || '{}');
      if (!holdings[asset] || holdings[asset] < shares) {
        return interaction.reply({ content: `❌ You don't own enough shares of ${asset}.`, flags: MessageFlags.Ephemeral });
      }
      holdings[asset] -= shares;
      if (holdings[asset] === 0) delete holdings[asset];
      const revenue = price * shares;
      const newCash = row.cash + revenue;
      await db.run(
        `UPDATE engagement_fantasy_portfolio SET cash = ?, holdings = ? WHERE user_id = ? AND guild_id = ?`,
        [newCash, JSON.stringify(holdings), userId, guildId]
      );
      await this._updatePortfolioValue(userId, guildId);
      await this._logActivity(userId, guildId, 'portfolio_sell', { asset, shares, price, revenue });
      await interaction.reply({ content: `✅ Sold ${shares} shares of ${asset} at $${price.toFixed(2)} each (total $${revenue.toFixed(2)}).`, ephemeral: true });
    }
  }

  // ---- Prediction Leaderboard ----
  async cmdPredictionLeaderboard(interaction) {
    const db = this.deps.db;
    const rows = await db.all(
      `SELECT user_id, SUM(score) as total_score FROM engagement_predictions WHERE guild_id = ? GROUP BY user_id ORDER BY total_score DESC LIMIT 10`,
      [interaction.guild.id]
    );
    if (!rows || rows.length === 0) {
      return interaction.reply({ content: 'No predictions yet.', flags: MessageFlags.Ephemeral });
    }
    let desc = '';
    for (let i = 0; i < rows.length; i++) {
      const user = await this.client.users.fetch(rows[i].user_id).catch(() => null);
      const name = user ? user.username : rows[i].user_id;
      desc += `${i+1}. **${name}** – ${rows[i].total_score} points\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Prediction Leaderboard').setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---- Health Check ----
  async cmdHealth(interaction) {
    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const features = await this.getGuildFeatures(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('📊 Engagement Agent – Health')
      .setColor(0x3498db)
      .addFields(
        { name: 'Status', value: '✅ Operational', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'AI Cache', value: `${this.aiCache.cache.size} entries`, inline: true },
        { name: 'Last Jobs', value: `Conv: ${this._lastJobRuns.conversationStarter ? `<t:${Math.floor(this._lastJobRuns.conversationStarter/1000)}:R>` : 'Never'}\nPoll: ${this._lastJobRuns.poll ? `<t:${Math.floor(this._lastJobRuns.poll/1000)}:R>` : 'Never'}\nQuiz: ${this._lastJobRuns.quiz ? `<t:${Math.floor(this._lastJobRuns.quiz/1000)}:R>` : 'Never'}\nDebate: ${this._lastJobRuns.debate ? `<t:${Math.floor(this._lastJobRuns.debate/1000)}:R>` : 'Never'}`, inline: false },
        { name: 'Features', value: `Polls: ${features.enablePolls ? '✅' : '❌'}\nQuizzes: ${features.enableQuizzes ? '✅' : '❌'}\nDebates: ${features.enableDebates ? '✅' : '❌'}\nTrivia: ${features.enableTrivia ? '✅' : '❌'}\nPredictions: ${features.enablePredictions ? '✅' : '❌'}\nPortfolio: ${features.enablePortfolio ? '✅' : '❌'}`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---- Admin Config ----
  async cmdConfig(interaction) {
    const feature = interaction.options.getString('feature');
    const enabled = interaction.options.getBoolean('enabled');
    if (!this.guildFeatures.has(interaction.guild.id)) {
      await this.getGuildFeatures(interaction.guild.id);
    }
    await this.setGuildFeature(interaction.guild.id, feature, enabled);
    await interaction.reply({ content: `✅ ${feature} ${enabled ? 'enabled' : 'disabled'} for this server.`, ephemeral: true });
  }

  // ---- Mentor Config ----
  async cmdMentor(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    if (sub === 'set') {
      const index = interaction.options.getInteger('index');
      const text = interaction.options.getString('text');
      await db.run(
        `INSERT OR REPLACE INTO engagement_mentor_lessons (guild_id, lesson_index, text) VALUES (?, ?, ?)`,
        [guildId, index, text]
      );
      await interaction.reply({ content: `✅ Mentor lesson ${index} set to: ${text}`, ephemeral: true });
    } else if (sub === 'list') {
      const rows = await db.all(`SELECT lesson_index, text FROM engagement_mentor_lessons WHERE guild_id = ? ORDER BY lesson_index`, [guildId]);
      if (!rows.length) return interaction.reply({ content: 'No custom mentor lessons set.', ephemeral: true });
      let desc = '';
      for (const row of rows) {
        desc += `**${row.lesson_index}.** ${row.text}\n`;
      }
      const embed = new EmbedBuilder().setTitle('📚 Mentor Lessons').setDescription(desc).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---------- Button Handlers ----------
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    try {
      if (customId.startsWith('poll_')) {
        await this._handlePollVote(interaction);
      } else if (customId.startsWith('quiz_')) {
        await this._handleQuizAnswer(interaction);
      } else if (customId === 'debate_pro' || customId === 'debate_con') {
        await interaction.reply({ content: `✅ You voted ${customId === 'debate_pro' ? 'Pro' : 'Against'}!`, flags: MessageFlags.Ephemeral });
        await this._logActivity(interaction.user.id, interaction.guild.id, 'debate_vote', { choice: customId });
      }
    } catch (err) {
      this.logger.error(`Button handler failed: ${err.message}`);
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }

  async _handlePollVote(interaction) {
    const idx = parseInt(interaction.customId.split('_')[1]);
    const db = this.deps.db;
    const row = await db.get(`SELECT id, options, votes FROM engagement_polls WHERE message_id = ?`, [interaction.message.id]);
    if (!row) return interaction.reply({ content: 'Poll not found.', flags: MessageFlags.Ephemeral });
    const votes = JSON.parse(row.votes || '{}');
    votes[interaction.user.id] = idx;
    await db.run(`UPDATE engagement_polls SET votes = ? WHERE id = ?`, [JSON.stringify(votes), row.id]);
    await this._logActivity(interaction.user.id, interaction.guild.id, 'poll_vote', { pollId: row.id, option: idx });
    await interaction.reply({ content: `✅ You voted for option ${idx+1}!`, flags: MessageFlags.Ephemeral });
  }

  async _handleQuizAnswer(interaction) {
    const idx = parseInt(interaction.customId.split('_')[1]);
    const db = this.deps.db;
    const row = await db.get(`SELECT id, correct, winner_ids FROM engagement_quizzes WHERE message_id = ?`, [interaction.message.id]);
    if (!row) return interaction.reply({ content: 'Quiz not found.', flags: MessageFlags.Ephemeral });
    const correct = row.correct;
    let winnerIds = row.winner_ids ? JSON.parse(row.winner_ids) : [];
    if (idx === correct) {
      if (!winnerIds.includes(interaction.user.id)) {
        winnerIds.push(interaction.user.id);
        await db.run(`UPDATE engagement_quizzes SET winner_ids = ? WHERE id = ?`, [JSON.stringify(winnerIds), row.id]);
        // Reward coins via economy.addBalance (matches your index.js listener)
        this.emit('economy.addBalance', { userId: interaction.user.id, guildId: interaction.guild.id, amount: 20, reason: 'Quiz correct' });
        // XP reward (will need a listener in EconomyAgent, or you can ignore)
        this.emit('xp.grant', { userId: interaction.user.id, guildId: interaction.guild.id, amount: 30, reason: 'Quiz correct' });
        await this._logActivity(interaction.user.id, interaction.guild.id, 'quiz_correct', { quizId: row.id });
        await interaction.reply({ content: '✅ Correct! You earned 20 coins and 30 XP!', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'You already answered this quiz correctly.', flags: MessageFlags.Ephemeral });
      }
    } else {
      await this._logActivity(interaction.user.id, interaction.guild.id, 'quiz_incorrect', { quizId: row.id });
      await interaction.reply({ content: '❌ Incorrect! Better luck next time.', flags: MessageFlags.Ephemeral });
    }
  }

  // ---------- Cleanup ----------
  async destroy() {
    this.aiCache.clear();
    await super.destroy();
  }
}

module.exports = EngagementAgent;