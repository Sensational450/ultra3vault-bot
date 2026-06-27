/**
 * 🎙️ AMAAgent v6.0 — AI Co‑Host for AMA Sessions
 * - Auto‑replies to questions in #ama-chat
 * - Uses OpenAI for intelligent responses, falls back to Gemini
 * - Fetches market data from PriceFeedAgent
 * - Logs Q&A pairs to database
 * - Generates AMA summaries using AI (OpenAI → Gemini → fallback)
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AMAAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // Configuration
    this.amaChannelId = process.env.AMA_CHANNEL_ID;
    this.enabled = !!this.amaChannelId;
    this.conversationMemory = new Map(); // channelId → messages[]
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

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY missing – Gemini disabled.');
    }

    // Fallback responses (only used if both AI providers fail)
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

    // Subscribe to AMA summary requests
    this.subscribe('job.amasummary', async () => {
      await this._postAMASummary();
    });

    this.logger.info(`🎙️ AMAAgent v6.0 ready (channel: ${this.amaChannelId})`);
  }

  // ===================== MESSAGE HANDLER =====================
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
      const response = await this._generateResponse(message);
      if (response) {
        await message.reply(response);
        await this._logQA(message.author.id, message.content, response);
      }
    } catch (err) {
      this.logger.error(`AMA response failed: ${err.message}`);
    }
  }

  // ===================== AI RESPONSE GENERATION =====================
  async _generateResponse(message) {
    const context = this._getConversationContext(message.channel.id);
    const prompt = this._buildPrompt(message.content, context);
    let result = null;

    // 1. Try OpenAI
    if (this.openai) {
      try {
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
        this.logger.debug('✅ OpenAI AMA response success');
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI AMA response failed: ${err.message} – trying Gemini`);
      }
    }

    // 2. Try Gemini (if OpenAI failed or not available)
    if (!result && this.useGemini) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a friendly crypto community manager. ${prompt}` }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        });
        result = geminiResult.response.text().trim();
        this.logger.debug('✅ Gemini AMA response success');
      } catch (err) {
        this.logger.warn(`⚠️ Gemini AMA response failed: ${err.message}`);
      }
    }

    // 3. Fallback to hardcoded responses
    if (!result) {
      result = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
      this.logger.warn('⚠️ Using fallback AMA response');
    }

    return result;
  }

  // ===================== CONVERSATION MEMORY =====================
  _addToMemory(channelId, message) {
    if (!this.conversationMemory.has(channelId)) {
      this.conversationMemory.set(channelId, []);
    }
    const memory = this.conversationMemory.get(channelId);
    memory.push(message);
    if (memory.length > this.memoryLimit) {
      memory.shift();
    }
  }

  _getConversationContext(channelId) {
    const memory = this.conversationMemory.get(channelId) || [];
    return memory.slice(-10).map(m => `${m.author}: ${m.content}`).join('\n');
  }

  _buildPrompt(question, context) {
    let prompt = `Question: ${question}\n`;
    if (context) {
      prompt += `\nPrevious conversation:\n${context}\n`;
    }
    prompt += '\nProvide a helpful, concise response:';
    return prompt;
  }

  // ===================== QUESTION LOGGING =====================
  async _logQA(userId, question, answer) {
    try {
      await this.db.run(
        `INSERT INTO ama_history (userId, question, answer, timestamp, guildId)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, question, answer, Date.now(), this.client.guilds.cache.first()?.id || 'unknown']
      );
    } catch (err) {
      this.logger.debug(`Failed to log AMA Q&A: ${err.message}`);
    }
  }

  // ===================== AMA SUMMARY =====================
  async _postAMASummary() {
    const channel = this.client.channels.cache.get(this.amaChannelId);
    if (!channel || !channel.isTextBased()) return;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await this.db.all(
      `SELECT * FROM ama_history WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 20`,
      [weekAgo]
    );

    if (!rows || rows.length === 0) {
      await channel.send('📋 No AMA questions recorded this week. Ask away!');
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
        this.logger.debug('✅ OpenAI AMA summary success');
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI AMA summary failed: ${err.message} – trying Gemini`);
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
        this.logger.debug('✅ Gemini AMA summary success');
      } catch (err) {
        this.logger.warn(`⚠️ Gemini AMA summary failed: ${err.message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🎙️ AMA Session Summary')
      .setDescription(summary || `Here are the top questions from this AMA session:`)
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

    await channel.send({ embeds: [embed] });
    this.logger.info('🎙️ AMA summary posted');
  }

  // ===================== SLASH COMMANDS =====================
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

    await interaction.deferReply({ ephemeral: true });

    const rows = await this.db.all(
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

    await this.db.run(
      `INSERT INTO ama_history (userId, question, answer, timestamp, guildId)
       VALUES (?, ?, ?, ?, ?)`,
      [interaction.user.id, question, 'Pending answer...', Date.now(), interaction.guild.id]
    );

    await interaction.reply({
      content: `✅ Your question has been submitted!\n\n**Question:** ${question}\n\nYou'll receive an answer soon! 🎙️`,
      ephemeral: true,
    });

    const channel = this.client.channels.cache.get(this.amaChannelId);
    if (channel && channel.isTextBased()) {
      await channel.send(`📋 **Question from ${interaction.user.username}:**\n${question}\n\n_Answer pending..._`);
    }
  }
}

module.exports = AMAAgent;