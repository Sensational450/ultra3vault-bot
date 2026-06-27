/**
 * 🎙️ AMAAgent v6.7 — AI Co‑Host for AMA Sessions (Customizable Gemini Model)
 * - Uses OpenAI (primary), falls back to Gemini with configurable model via GEMINI_MODEL env
 * - If Gemini fails, logs the error and uses fallback responses
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
      // Allow user to override model via env, default to gemini-1.5-pro
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
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
    this.logger.info(`🎙️ AMAAgent v6.7 ready (channel: ${this.amaChannelId})`);
  }

  // ---------- Table Creation ----------
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

    this._addToMemory(message.channel.id, {
      role: 'user',
      content: message.content,
      author: message.author.username,
    });

    try {
      const answer = await this._generateAnswer(message.content);
      await message.reply(answer);
      await this._logQA(message.author.id, message.content, answer);
    } catch (err) {
      this.logger.error(`AMA response failed: ${err.message}`);
    }
  }

  // ---------- AI Answer Generation ----------
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
        if (err.status === 429) {
          this.logger.warn('⚠️ OpenAI quota exceeded – trying Gemini');
        }
      }
    }

    // 2. Try Gemini (if OpenAI failed or not available)
    if (!result && this.useGemini) {
      try {
        this.logger.debug(`⏳ Asking Gemini (${this.geminiModel})...`);
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
        // Provide helpful hint
        if (err.message.includes('404')) {
          this.logger.error('💡 Try setting a different Gemini model via GEMINI_MODEL env (e.g., gemini-1.5-flash, gemini-2.0-flash-exp).');
        }
      }
    }

    // 3. Fallback
    if (!result) {
      result = this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
      this.logger.warn('⚠️ Using fallback answer – check API keys and model name.');
    }

    return result;
  }

  // ---------- Memory Helpers ----------
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

  // ---------- Database ----------
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

  // ---------- AMA Summary ----------
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
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI summary failed: ${err.message} – trying Gemini`);
      }
    }

    if (!summary && this.useGemini) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a community manager. Summarize these AMA questions and answers:\n\n${summaryText}` }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.5 },
        });
        summary = geminiResult.response.text().trim();
      } catch (err) {
        this.logger.warn(`⚠️ Gemini summary failed: ${err.message}`);
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

    await interaction.deferReply({ ephemeral: true });

    let answer = 'No answer generated.';
    try {
      answer = await this._generateAnswer(question);
    } catch (err) {
      this.logger.error(`Error generating answer: ${err.message}`);
      answer = 'Sorry, I could not generate an answer right now. Please try again later.';
    }

    await this._logQA(interaction.user.id, question, answer);

    await interaction.editReply({
      content: `✅ Your question:\n**${question}**\n\n🤖 Answer:\n${answer}`,
    });

    const channel = this.client.channels.cache.get(this.amaChannelId);
    if (channel && channel.isTextBased()) {
      await channel.send(`📋 **Question from ${interaction.user.username}:**\n${question}\n\n💬 **Answer:**\n${answer}`);
    }
  }
}

module.exports = AMAAgent;