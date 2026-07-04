/**
 * 🎙️ AMAAgent v8.0 — Advanced AMA & Q&A
 * - Persistent conversation memory (DB), context summarization
 * - Retry & exponential backoff for AI calls
 * - Per‑user rate limiting (cooldown + quota)
 * - Feedback buttons (👍/👎) with DB storage
 * - Admin logging via webhook
 * - Tool integration (price, news, whale alerts)
 * - Typing indicator
 * - Improved error handling & fallbacks
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { sendWebhook } = require('../core/webhook');

class AMAAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    this.amaChannelId = process.env.AMA_CHANNEL_ID;
    this.enabled = !!this.amaChannelId;
    this.memoryLimit = 50; // max messages in memory before summarization

    // ---- Model config ----
    this.model = process.env.AMA_MODEL || 'gpt-3.5-turbo';
    this.temperature = parseFloat(process.env.AMA_TEMPERATURE) || 0.7;
    this.maxTokens = parseInt(process.env.AMA_MAX_TOKENS) || 200;

    // ---- Rate limiting ----
    this.rateLimitPerMinute = parseInt(process.env.AMA_RATE_LIMIT) || 3;
    this.cooldownSeconds = parseInt(process.env.AMA_COOLDOWN_SECONDS) || 10;

    // ---- Webhook display ----
    this.webhookUsername = 'Judge';
    this.webhookAvatarURL = process.env.AMA_WEBHOOK_AVATAR || null;

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

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }

    // ---- Fallback responses ----
    this.fallbackResponses = [
      "That's a great question! Let me get back to you on that.",
      "Interesting question! I'll look into this and get back to you.",
      "Thanks for asking! I'm checking on this for you.",
      "Let me find the best answer for you. One moment!",
    ];

    // ---- Summary fallback ----
    this.fallbackSummary = 'Here are the top questions from this AMA session:';

    // ---- Admin log webhook ----
    this.adminLogWebhook = process.env.AMA_ADMIN_LOG_WEBHOOK_URL || process.env.LOG_WEBHOOK_URL;

    // ---- Feedback map (for button handling) ----
    this._feedbackMap = new Map();

    // ---- Tool integration ----
    this.toolEnabled = process.env.AMA_ENABLE_TOOLS !== 'false';
  }

  async init() {
    await super.init();
    if (!this.enabled) {
      this.logger.warn('⚠️ AMA_CHANNEL_ID not set — AMAAgent disabled');
      return;
    }
    await this._ensureTables();
    this.subscribe('job.amasummary', async () => {
      await this._postAMASummary();
    });
    const hasWebhook = !!process.env.AMA_WEBHOOK_URL;
    this.logger.info(`🎙️ AMAAgent v8.0 ready (channel: ${this.amaChannelId}, webhook: ${hasWebhook ? '✅' : '❌'})`);
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ama_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        guildId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS ama_rate_limits (
        userId TEXT,
        guildId TEXT,
        resetTime INTEGER,
        count INTEGER,
        lastQuestion INTEGER,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS ama_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        guildId TEXT,
        question TEXT,
        answer TEXT,
        feedback INTEGER, -- 1 = like, -1 = dislike
        timestamp INTEGER
      );
    `);
  }

  // ---------- Memory (DB-based) ----------
  async _getMemory(userId, guildId, limit = 20) {
    const db = this.deps.db;
    const rows = await db.all(
      `SELECT role, content FROM ama_history
       WHERE userId = ? AND guildId = ?
       ORDER BY timestamp DESC LIMIT ?`,
      [userId, guildId, limit]
    );
    return rows.reverse(); // oldest first
  }

  async _addMemory(userId, guildId, role, content) {
    const db = this.deps.db;
    await db.run(
      `INSERT INTO ama_history (userId, guildId, role, content, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, guildId, role, content, Date.now()]
    );
  }

  async _clearMemory(userId, guildId) {
    const db = this.deps.db;
    await db.run(`DELETE FROM ama_history WHERE userId = ? AND guildId = ?`, [userId, guildId]);
  }

  // ---------- Context summarization ----------
  async _summarizeMemory(userId, guildId, messages) {
    if (messages.length <= 10) return messages;
    // Summarize older messages (first N-5) into a concise summary
    const toSummarize = messages.slice(0, messages.length - 5);
    const recent = messages.slice(messages.length - 5);
    const summaryPrompt = `Summarise the following conversation into a concise paragraph (max 50 words) that captures the key points:\n\n${toSummarize.map(m => `${m.role}: ${m.content}`).join('\n')}`;
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
    // Replace older messages with summary + keep recent
    const newMemory = [{ role: 'system', content: `Previous conversation summary: ${summary}` }];
    return [...newMemory, ...recent];
  }

  // ---------- Rate limiting ----------
  async _checkRateLimit(userId, guildId) {
    const db = this.deps.db;
    const now = Date.now();
    const minute = 60 * 1000;
    let row = await db.get(`SELECT resetTime, count, lastQuestion FROM ama_rate_limits WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    if (!row || now > row.resetTime) {
      // Reset
      await db.run(
        `INSERT OR REPLACE INTO ama_rate_limits (userId, guildId, resetTime, count, lastQuestion)
         VALUES (?, ?, ?, 1, ?)`,
        [userId, guildId, now + minute, now]
      );
      return false;
    }
    // Check cooldown (lastQuestion + cooldownSeconds * 1000 > now)
    if (row.lastQuestion && now - row.lastQuestion < this.cooldownSeconds * 1000) {
      return true; // still cooling down
    }
    if (row.count >= this.rateLimitPerMinute) {
      return true; // exceeded per-minute limit
    }
    // Increment count
    await db.run(
      `UPDATE ama_rate_limits SET count = count + 1, lastQuestion = ? WHERE userId = ? AND guildId = ?`,
      [now, userId, guildId]
    );
    return false;
  }

  // ---------- Tool integration ----------
  async _executeTool(query) {
    const lower = query.toLowerCase();
    // Price check
    if (lower.includes('price') || lower.includes('btc') || lower.includes('eth') || lower.includes('sol')) {
      const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
      if (priceAgent) {
        try {
          const coin = lower.match(/\b(btc|eth|sol|bnb|xrp|ada|doge|dot|avax|matic)\b/i)?.[0] || 'bitcoin';
          const price = await priceAgent.fetchPrice(coin);
          if (price) {
            return `Current price of ${coin.toUpperCase()}: $${price.usd.toFixed(2)} (updated ${new Date(price.lastUpdatedAt * 1000).toLocaleString()})`;
          }
        } catch (err) { /* ignore */ }
      }
    }
    // News
    if (lower.includes('news')) {
      const newsAgent = this.deps.orchestrator?.getAgent('NewsAgent');
      if (newsAgent) {
        // Try to get the latest news from cache (if any)
        return "I can fetch the latest crypto news for you. Use `/news` or check the #crypto-news channel.";
      }
    }
    // Whale
    if (lower.includes('whale') || lower.includes('large transaction')) {
      const whaleAgent = this.deps.orchestrator?.getAgent('WhaleAgent');
      if (whaleAgent && whaleAgent.recentWhales && whaleAgent.recentWhales.length > 0) {
        const recent = whaleAgent.recentWhales.slice(0, 3);
        const list = recent.map(w => `${w.amount} ${w.symbol} ($${(w.usdValue/1e6).toFixed(1)}M)`).join('\n');
        return `Recent whale movements:\n${list}`;
      }
    }
    return null;
  }

  // ---------- AI Answer Generation with Retry ----------
  async _generateAnswer(question, context = '') {
    // Rate limit check
    // We'll check in the message handler, but also here.

    const prompt = this._buildPrompt(question, context);
    let result = null;
    let provider = 'none';

    // Try tools first if enabled
    let toolResult = null;
    if (this.toolEnabled) {
      toolResult = await this._executeTool(question);
    }
    const finalPrompt = toolResult ? `Context: ${toolResult}\n\nQuestion: ${question}` : prompt;

    // Build messages
    let messages = [{ role: 'system', content: 'You are a friendly and knowledgeable crypto community manager hosting an AMA. Answer questions about cryptocurrency, blockchain, DeFi, NFTs, trading, and the Ultra3Vault community. Keep responses concise (2-3 sentences), informative, and engaging. If you don\'t know something, say so honestly and offer to find out. Always be positive and encouraging.' }];
    const history = await this._getMemory(interaction?.user?.id || 'unknown', interaction?.guild?.id || 'unknown', 20);
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: finalPrompt });

    // Summarize if too long
    messages = await this._summarizeMemory(interaction?.user?.id || 'unknown', interaction?.guild?.id || 'unknown', messages);

    // Try with retry
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        if (this.openai) {
          const response = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
          });
          result = response.choices[0].message.content.trim();
          provider = 'openai';
          this.logger.debug('✅ OpenAI answer success');
          break;
        } else if (this.useGemini) {
          const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
          // Gemini history conversion
          const geminiHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
          }));
          const chat = model.startChat({
            history: geminiHistory,
            generationConfig: {
              maxOutputTokens: this.maxTokens,
              temperature: this.temperature,
            },
          });
          const geminiResult = await chat.sendMessage(finalPrompt);
          result = geminiResult.response.text().trim();
          provider = 'gemini';
          this.logger.debug('✅ Gemini answer success');
          break;
        } else {
          // No AI available
          result = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
          provider = 'fallback';
          break;
        }
      } catch (err) {
        attempt++;
        const wait = 1000 * Math.pow(2, attempt);
        this.logger.warn(`AMA AI attempt ${attempt} failed: ${err.message}, retry in ${wait}ms`);
        if (attempt >= maxRetries) {
          result = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
          provider = 'fallback';
        } else {
          await new Promise(resolve => setTimeout(resolve, wait));
        }
      }
    }

    // Store in memory (only for non-fallback)
    if (result && !this.fallbackResponses.includes(result)) {
      // We'll store later when we have userId/guildId.
    }

    // Admin logging
    // We'll log in the caller.

    return { answer: result, provider };
  }

  // ---------- Message Handler ----------
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

    // Rate limit check
    const isLimited = await this._checkRateLimit(message.author.id, message.guild.id);
    if (isLimited) {
      const reply = await message.reply('⏱️ Please slow down! You are asking too many questions. Wait a moment and try again.');
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    // Typing indicator
    await message.channel.sendTyping();

    try {
      const { answer, provider } = await this._generateAnswer(message.content, this._getConversationContext(message.channel.id));
      // Store in DB
      await this._addMemory(message.author.id, message.guild.id, 'user', message.content);
      await this._addMemory(message.author.id, message.guild.id, 'assistant', answer);

      // Send reply with feedback buttons
      const embed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(answer)
        .setColor(0x9b59b6)
        .setFooter({ text: `Answered by ${provider} • use /amaquestion to ask directly` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ama_like_${message.id}`)
          .setLabel('👍')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ama_dislike_${message.id}`)
          .setLabel('👎')
          .setStyle(ButtonStyle.Danger)
      );

      const sent = await message.reply({ embeds: [embed], components: [row] });
      // Store feedback mapping
      this._feedbackMap.set(sent.id, {
        userId: message.author.id,
        guildId: message.guild.id,
        question: message.content,
        answer: answer,
      });

      // Admin log
      await this._logInteraction(message.author.id, message.guild.id, message.content, answer, provider);

    } catch (err) {
      this.logger.error(`AMA response failed: ${err.message}`);
      await message.reply('❌ Sorry, I could not generate an answer right now. Please try again later.');
    }
  }

  // ---------- Admin Logging ----------
  async _logInteraction(userId, guildId, question, answer, provider) {
    if (!this.adminLogWebhook) return;
    try {
      const embed = {
        title: '🎙️ AMA Interaction',
        color: 0x9b59b6,
        fields: [
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Provider', value: provider, inline: true },
          { name: 'Question', value: question.slice(0, 500), inline: false },
          { name: 'Answer', value: answer.slice(0, 500), inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      const axios = require('axios');
      await axios.post(this.adminLogWebhook, { embeds: [embed] }, { timeout: 5000 });
    } catch (err) { /* ignore */ }
  }

  // ---------- Feedback Handling ----------
  async _storeFeedback(userId, guildId, question, answer, feedback) {
    const db = this.deps.db;
    await db.run(
      `INSERT INTO ama_feedback (userId, guildId, question, answer, feedback, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, guildId, question, answer, feedback, Date.now()]
    );
  }

  // ---------- Button Handler ----------
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    const { customId } = interaction;
    if (customId.startsWith('ama_like_')) {
      const msgId = customId.replace('ama_like_', '');
      const data = this._feedbackMap.get(msgId);
      if (data) {
        await this._storeFeedback(data.userId, data.guildId, data.question, data.answer, 1);
        await interaction.reply({ content: '✅ Thanks for your feedback!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Feedback could not be processed.', ephemeral: true });
      }
    } else if (customId.startsWith('ama_dislike_')) {
      const msgId = customId.replace('ama_dislike_', '');
      const data = this._feedbackMap.get(msgId);
      if (data) {
        await this._storeFeedback(data.userId, data.guildId, data.question, data.answer, -1);
        await interaction.reply({ content: '✅ Thanks for your feedback!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Feedback could not be processed.', ephemeral: true });
      }
    }
  }

  // ---------- _getConversationContext (for onMessage) ----------
  _getConversationContext(channelId) {
    // Not used in new version, but we keep for compatibility.
    return '';
  }

  // ---------- Existing methods (unchanged) ----------
  // _buildPrompt, _postAMASummary, slash commands, etc.
  // We'll keep them as they are, but they will use the new memory/retry logic.

  // We'll override _buildPrompt to use the new context.
  // Actually, we'll keep the existing command handlers for manual questions.
  // We'll update the cmdAMAQuestion to use the new _generateAnswer.

  // ---------- Slash Commands ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'amasummary':
        await this.cmdAMASummary(interaction);
        break;
      case 'amaquestion':
        await this.cmdAMAQuestion(interaction);
        break;
    }
  }

  async cmdAMASummary(interaction) {
    if (!interaction.memberPermissions.has('ManageMessages')) {
      return interaction.reply({ content: '❌ You need `Manage Messages` permission.', ephemeral: true });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rows = await this.deps.db.all(
      `SELECT * FROM ama_history WHERE guildId = ? ORDER BY timestamp DESC LIMIT 20`,
      [interaction.guild.id]
    );

    if (!rows || rows.length === 0) {
      return interaction.editReply({ content: '📋 No AMA questions recorded yet.' });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎙️ AMA History')
      .setColor(0x9b59b6)
      .setDescription(`Recent questions (${rows.length} total):`);

    for (const row of rows.slice(0, 10)) {
      embed.addFields({
        name: `❓ ${row.question}`,
        value: `💬 ${row.answer.substring(0, 80)}${row.answer.length > 80 ? '...' : ''}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  async cmdAMAQuestion(interaction) {
    const question = interaction.options.getString('question');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let answer = 'No answer generated.';
    let provider = 'none';
    try {
      // Use the new generation with retry and tools
      const result = await this._generateAnswer(question, '');
      answer = result.answer;
      provider = result.provider;
    } catch (err) {
      this.logger.error(`Error generating answer: ${err.message}`);
      answer = 'Sorry, I could not generate an answer right now. Please try again later.';
    }

    await this._addMemory(interaction.user.id, interaction.guild.id, 'user', question);
    await this._addMemory(interaction.user.id, interaction.guild.id, 'assistant', answer);

    await this._logInteraction(interaction.user.id, interaction.guild.id, question, answer, provider);

    await interaction.editReply({
      content: `✅ Your question:\n**${question}**\n\n🤖 Answer:\n${answer}`,
    });

    // Post to the AMA channel via webhook
    const embed = new EmbedBuilder()
      .setTitle(`📋 Question from ${interaction.user.username}`)
      .setDescription(`**Question:** ${question}\n\n**Answer:** ${answer}`)
      .setColor(0x9b59b6)
      .setTimestamp();

    await this._sendAMAMessage(null, embed);
  }

  // ---------- _sendAMAMessage (unchanged) ----------
  async _sendAMAMessage(content, embed = null, components = null) {
    // 1. Try webhook if configured
    if (process.env.AMA_WEBHOOK_URL) {
      try {
        const payload = { embeds: embed ? [embed] : undefined, components: components || undefined };
        if (content && typeof content === 'string') payload.content = content;
        await sendWebhook('ama', payload, {
          username: this.webhookUsername,
          avatarURL: this.webhookAvatarURL || undefined,
        });
        this.logger.debug('✅ AMA message sent via Judge webhook');
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to channel.send`);
      }
    }

    // 2. Fallback: use the channel directly
    const channel = this.client.channels.cache.get(this.amaChannelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`AMA channel ${this.amaChannelId} not found or not text-based`);
      return;
    }

    if (content && typeof content === 'string') {
      await channel.send(content);
    } else if (embed) {
      await channel.send({ embeds: [embed], components: components || [] });
    }
    this.logger.debug('✅ AMA message sent via channel.send');
  }

  // ---------- _postAMASummary (unchanged but we should update to use new memory?) Actually it uses ama_history table which we already have. ----------
  async _postAMASummary() {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await this.deps.db.all(
      `SELECT * FROM ama_history WHERE timestamp > ? AND guildId = ? ORDER BY timestamp DESC LIMIT 20`,
      [weekAgo, this.client.guilds.cache.first()?.id || 'unknown']
    );

    if (!rows || rows.length === 0) {
      await this._sendAMAMessage('📋 No AMA questions recorded this week. Ask away!');
      return;
    }

    const summaryText = rows.map((row, i) => `${i+1}. Q: ${row.question}\n   A: ${row.answer}\n`).join('\n');
    let summary = null;

    // 1. Try OpenAI
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a community manager summarizing an AMA session. Create a concise summary of the key topics discussed.' },
            { role: 'user', content: `Summarize these AMA questions and answers:\n\n${summaryText}` }
          ],
          max_tokens: 300,
          temperature: 0.5,
        });
        summary = response.choices[0].message.content.trim();
        this.logger.debug('✅ OpenAI summary success');
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI summary failed: ${err.message} – trying Gemini`);
      }
    }

    // 2. Try Gemini
    if (!summary && this.useGemini) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a community manager. Summarize these AMA questions and answers:\n\n${summaryText}` }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.5 },
        });
        summary = geminiResult.response.text().trim();
        this.logger.debug('✅ Gemini summary success');
      } catch (err) {
        this.logger.warn(`⚠️ Gemini summary failed: ${err.message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🎙️ AMA Session Summary')
      .setDescription(summary || this.fallbackSummary)
      .setColor(0x9b59b6)
      .setTimestamp();

    if (rows.length > 0) {
      const topQuestions = rows.slice(0, 5);
      for (const row of topQuestions) {
        embed.addFields({
          name: `❓ ${row.question}`,
          value: `💬 ${row.answer.substring(0, 100)}${row.answer.length > 100 ? '...' : ''}`,
          inline: false,
        });
      }
    }

    await this._sendAMAMessage(null, embed);
    this.logger.info('🎙️ AMA summary posted');
  }

  // ---------- Cleanup ----------
  async destroy() {
    this._feedbackMap.clear();
    await super.destroy();
  }
}

module.exports = AMAAgent;