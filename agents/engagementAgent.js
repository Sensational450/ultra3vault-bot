/**
 * 🎯 EngagementAgent v1.0 – Interactive Community Engine
 * - Polls, quizzes, debates, predictions, fantasy portfolio, trivia, mentor, conversation starter
 * - Rewards XP and coins via EconomyAgent events
 * - Uses OpenAI/Gemini for content generation (fallback to curated templates)
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

class EngagementAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config ----
    this.triviaFacts = [
      'Bitcoin has never been hacked.',
      'The first Bitcoin transaction was for two pizzas (10,000 BTC).',
      'Ethereum was proposed in 2013 by Vitalik Buterin.',
      // ... (I'll provide a large list later)
    ];
    this.pollChannelId = process.env.POLL_CHANNEL_ID;
    this.quizChannelId = process.env.QUIZ_CHANNEL_ID;
    this.debateChannelId = process.env.DEBATE_CHANNEL_ID;
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
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-pro';
        this.useGemini = true;
        this.logger.info('🧠 Gemini available for EngagementAgent');
      }
    } catch (err) {
      this.logger.warn(`AI init failed: ${err.message}`);
    }

    // ---- Caches ----
    this.quizCache = new Map();
    this.pollCache = new Map();
    this.debateCache = new Map();
    this.predictionCache = new Map();

    // ---- Fantasy Portfolio ----
    this.portfolioCache = new Map(); // userId → { cash, holdings: { symbol, shares }, totalValue }

    // ---- Prediction League ----
    this.predictionScores = new Map(); // userId → points
  }

  async init() {
    await super.init();
    await this._ensureTables();

    // Subscribe to jobs
    this.subscribe('job.conversationStarter', async () => {
      await this._postConversationStarter();
    });
    this.subscribe('job.dailyPoll', async () => {
      await this._postDailyPoll();
    });
    this.subscribe('job.dailyQuiz', async () => {
      await this._postDailyQuiz();
    });
    this.subscribe('job.dailyDebate', async () => {
      await this._postDailyDebate();
    });
    this.subscribe('job.trivia', async () => {
      await this._postTrivia();
    });
    this.subscribe('job.mentor', async () => {
      await this._sendMentorLessons();
    });
    this.subscribe('job.autoSummarize', async () => {
      await this._autoSummarize();
    });

    this.logger.info('🎯 EngagementAgent ready');
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
        prediction TEXT,
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
    `);
  }

  // ---------- AI Helpers ----------
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

  // ---------- 1. Conversation Starter ----------
  async _postConversationStarter() {
    const prompt = 'Generate a short, engaging crypto discussion question for a community.';
    const fallback = "💬 **Question of the Day:** What's one crypto project you're most excited about and why?";
    const content = await this._callAI(prompt, fallback);

    const channelId = process.env.GENERAL_CHAT_CHANNEL_ID;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(content);
    this.logger.info('💬 Conversation starter posted');
  }

  // ---------- 2. Daily Poll ----------
  async _postDailyPoll() {
    const prompt = 'Generate a crypto poll with a question and 4 options. Format: Question|Option1|Option2|Option3|Option4';
    const fallback = 'Which crypto will perform best this week?|Bitcoin|Ethereum|Solana|Cardano';
    const raw = await this._callAI(prompt, fallback);
    const parts = raw.split('|').map(s => s.trim());
    const question = parts[0] || 'Poll';
    const options = parts.slice(1, 5);
    if (options.length < 2) return;

    const channelId = this.pollChannelId || process.env.ANNOUNCEMENT_CHANNEL_ID;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

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
    // Store poll in DB
    const db = this.deps.db;
    const result = await db.run(
      `INSERT INTO engagement_polls (question, options, votes, created_at) VALUES (?, ?, ?, ?)`,
      [question, JSON.stringify(options), JSON.stringify({}), Date.now()]
    );
    const pollId = result.lastID;
    const sent = await channel.send({ embeds: [embed], components: [row] });
    await db.run(`UPDATE engagement_polls SET message_id = ? WHERE id = ?`, [sent.id, pollId]);
    this.logger.info(`📊 Poll posted (ID: ${pollId})`);
  }

  // ---------- 3. Daily Quiz ----------
  async _postDailyQuiz() {
    const prompt = 'Generate a crypto quiz question with 4 options and the correct answer index (0-3). Format: Question|Option1|Option2|Option3|Option4|CorrectIndex';
    const fallback = 'What is the native token of Ethereum?|Bitcoin|Ethereum|Solana|Cardano|1';
    const raw = await this._callAI(prompt, fallback);
    const parts = raw.split('|').map(s => s.trim());
    if (parts.length < 6) return;
    const question = parts[0];
    const options = parts.slice(1, 5);
    const correctIndex = parseInt(parts[5]);
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) return;

    const channelId = this.quizChannelId || process.env.ANNOUNCEMENT_CHANNEL_ID;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle('🧠 Daily Quiz')
      .setDescription(`**${question}**\n\nReact with the correct option!`)
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
  }

  // ---------- 4. Daily Debate ----------
  async _postDailyDebate() {
    const prompt = 'Generate a crypto debate topic with a title and a short description. Format: Title|Description';
    const fallback = 'Bitcoin vs Ethereum|Which will be the dominant smart contract platform in 5 years?';
    const raw = await this._callAI(prompt, fallback);
    const parts = raw.split('|').map(s => s.trim());
    if (parts.length < 2) return;
    const [title, desc] = parts;

    const channelId = this.debateChannelId || process.env.ANNOUNCEMENT_CHANNEL_ID;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

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
  }

  // ---------- 5. Trivia ----------
  async _postTrivia() {
    const facts = [
      'Bitcoin has never been hacked.',
      'The first Bitcoin transaction was for two pizzas (10,000 BTC).',
      'Ethereum was proposed in 2013 by Vitalik Buterin.',
      'Satoshi Nakamoto is the pseudonymous creator of Bitcoin.',
      'There are only 21 million Bitcoins that will ever exist.',
      'The total market cap of all cryptocurrencies once exceeded $3 trillion.',
      'Ethereum switched to Proof-of-Stake in 2022 (The Merge).',
      // ... add more
    ];
    const fact = facts[Math.floor(Math.random() * facts.length)];
    const channelId = process.env.GENERAL_CHAT_CHANNEL_ID;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(`📜 **Crypto Trivia:** ${fact}`);
    this.logger.info('📜 Trivia posted');
  }

  // ---------- 6. Mentor ----------
  async _sendMentorLessons() {
    if (!this.mentorEnabled) return;
    const lessons = [
      '🔐 **Lesson 1: Wallet Security** – Never share your private key or seed phrase.',
      '📈 **Lesson 2: Market Orders** – A market order buys/sells immediately at current price.',
      '🧠 **Lesson 3: What is DeFi?** – Decentralized Finance offers lending, borrowing, and trading without banks.',
      '💎 **Lesson 4: HODL** – Holding long-term is a common strategy in crypto.',
      // ... more
    ];
    const db = this.deps.db;
    // Fetch all users who joined within the last 7 days and haven't completed all lessons
    // For simplicity, we'll get all users with mentor entries and send the next lesson.
    const rows = await db.all(`SELECT user_id, guild_id, lesson_index FROM engagement_mentor`);
    for (const row of rows) {
      const idx = row.lesson_index;
      if (idx >= lessons.length) continue;
      const user = await this.client.users.fetch(row.user_id).catch(() => null);
      if (!user) continue;
      try {
        await user.send(lessons[idx]);
        await db.run(`UPDATE engagement_mentor SET lesson_index = ? WHERE user_id = ? AND guild_id = ?`, [idx+1, row.user_id, row.guild_id]);
        this.logger.info(`📖 Mentor lesson sent to ${user.tag}`);
      } catch {}
    }
    // Also send to new users on join (hook)
  }

  // ---------- 7. Auto-Summarizer ----------
  async _autoSummarize() {
    // This listens to 'news.published' and uses SummaryAgent to generate a summary
    // We can emit an event or directly call SummaryAgent.
    // We'll subscribe to 'news.published' in init.
    // Actually we can just forward the event to SummaryAgent.
    // But we'll implement a simple version: if SummaryAgent exists, use it.
    const summaryAgent = this.deps.orchestrator?.getAgent('SummaryAgent');
    if (!summaryAgent) return;
    this.subscribe('news.published', async (data) => {
      const { item, category } = data;
      try {
        const summary = await summaryAgent.summarizeNewsItem(item);
        const channelId = process.env.NEWS_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID;
        if (!channelId) return;
        const channel = this.client.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return;
        const embed = new EmbedBuilder()
          .setTitle(`📰 ${item.title}`)
          .setURL(item.link)
          .setDescription(summary)
          .setColor(0x00ff88)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      } catch (err) {
        this.logger.debug(`Auto-summarize failed: ${err.message}`);
      }
    });
  }

  // ---------- 8. Fantasy Portfolio ----------
  async _updatePortfolioValue(userId, guildId) {
    // Fetch holdings, fetch current prices from PriceFeedAgent
    const db = this.deps.db;
    const row = await db.get(`SELECT holdings, cash FROM engagement_fantasy_portfolio WHERE user_id = ? AND guild_id = ?`, [userId, guildId]);
    if (!row) return;
    const holdings = JSON.parse(row.holdings || '{}');
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    let total = row.cash;
    for (const [symbol, shares] of Object.entries(holdings)) {
      const price = priceAgent?.priceCache?.get(symbol)?.price || 0;
      total += price * shares;
    }
    await db.run(`UPDATE engagement_fantasy_portfolio SET total_value = ? WHERE user_id = ? AND guild_id = ?`, [total, userId, guildId]);
    return total;
  }

  // ---------- Slash Commands ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    switch (commandName) {
      case 'poll':
        await this.cmdPoll(interaction);
        break;
      case 'quiz':
        await this.cmdQuiz(interaction);
        break;
      case 'predict':
        await this.cmdPredict(interaction);
        break;
      case 'portfolio':
        await this.cmdPortfolio(interaction);
        break;
      case 'leaderboard':
        if (interaction.options.getString('type') === 'predictions') {
          await this.cmdPredictionLeaderboard(interaction);
        }
        break;
    }
  }

  // ---- Poll command (Admin only) ----
  async cmdPoll(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',').map(s => s.trim());
    if (options.length < 2) return interaction.reply({ content: '❌ Need at least 2 options.', ephemeral: true });
    // Post poll immediately
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder().setTitle('📊 Poll').setDescription(`**${question}**`).setColor(0x3498db);
    const row = new ActionRowBuilder();
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < options.length; i++) {
      row.addComponents(new ButtonBuilder().setCustomId(`poll_${i}`).setLabel(`${labels[i]}: ${options[i]}`).setStyle(ButtonStyle.Primary));
    }
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Poll posted.', ephemeral: true });
  }

  // ---- Quiz command (Admin only) ----
  async cmdQuiz(interaction) {
    // Similar to poll, create a quiz manually.
  }

  // ---- Prediction command ----
  async cmdPredict(interaction) {
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
    await interaction.reply({ content: `✅ Your prediction for ${asset} at $${targetPrice} has been recorded!`, ephemeral: true });
  }

  // ---- Portfolio commands ----
  async cmdPortfolio(interaction) {
    // View portfolio, buy, sell
  }

  // ---- Prediction leaderboard ----
  async cmdPredictionLeaderboard(interaction) {
    // Show top predictors
  }

  // ---------- Button Handlers ----------
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (customId.startsWith('poll_')) {
      // Handle poll vote
      await this._handlePollVote(interaction);
    } else if (customId.startsWith('quiz_')) {
      await this._handleQuizAnswer(interaction);
    } else if (customId === 'debate_pro' || customId === 'debate_con') {
      // Handle debate vote
      await interaction.reply({ content: `✅ You voted ${customId === 'debate_pro' ? 'Pro' : 'Against'}!`, ephemeral: true });
    }
  }

  async _handlePollVote(interaction) {
    const idx = parseInt(interaction.customId.split('_')[1]);
    // Fetch poll from DB by message_id
    const db = this.deps.db;
    const row = await db.get(`SELECT id, options, votes FROM engagement_polls WHERE message_id = ?`, [interaction.message.id]);
    if (!row) return interaction.reply({ content: 'Poll not found.', ephemeral: true });
    const votes = JSON.parse(row.votes);
    votes[interaction.user.id] = idx;
    await db.run(`UPDATE engagement_polls SET votes = ? WHERE id = ?`, [JSON.stringify(votes), row.id]);
    await interaction.reply({ content: `✅ You voted for option ${idx+1}!`, ephemeral: true });
    // Optionally, update the embed with vote counts
  }

  async _handleQuizAnswer(interaction) {
    const idx = parseInt(interaction.customId.split('_')[1]);
    const db = this.deps.db;
    const row = await db.get(`SELECT id, correct, winner_ids FROM engagement_quizzes WHERE message_id = ?`, [interaction.message.id]);
    if (!row) return interaction.reply({ content: 'Quiz not found.', ephemeral: true });
    const correct = row.correct;
    const winnerIds = row.winner_ids ? JSON.parse(row.winner_ids) : [];
    if (idx === correct) {
      if (!winnerIds.includes(interaction.user.id)) {
        winnerIds.push(interaction.user.id);
        await db.run(`UPDATE engagement_quizzes SET winner_ids = ? WHERE id = ?`, [JSON.stringify(winnerIds), row.id]);
        // Reward XP/coins
        this.emit('economy.grant', { userId: interaction.user.id, guildId: interaction.guild.id, amount: 20, reason: 'Quiz correct' });
        this.emit('xp.grant', { userId: interaction.user.id, guildId: interaction.guild.id, amount: 30, reason: 'Quiz correct' });
        await interaction.reply({ content: '✅ Correct! You earned 20 coins and 30 XP!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'You already answered this quiz correctly.', ephemeral: true });
      }
    } else {
      await interaction.reply({ content: '❌ Incorrect! Better luck next time.', ephemeral: true });
    }
  }
}

module.exports = EngagementAgent;