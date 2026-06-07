/**
 * 🧠 AiChatAgent v5.0
 * - AI chat, sentiment analysis, image generation (OpenAI)
 * - Per‑guild configuration (enabled, whitelist, model, etc.)
 * - Conversation memory with sliding window and timeout
 * - Rate limiting per user
 * - Only handles its own commands – does not interfere with others
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class AiChatAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Lazy‑load OpenAI only if API key is present
    this.openai = null;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    if (this.openaiApiKey) {
      const OpenAI = require('openai');
      this.openai = new OpenAI({ apiKey: this.openaiApiKey });
    } else {
      this.logger.warn('⚠️ OPENAI_API_KEY missing – AI features disabled');
    }

    this.defaultConfig = {
      enabled: !!this.openaiApiKey,
      channelWhitelist: [],
      roleWhitelist: [],
      maxTokens: 500,
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant in a Discord crypto community. Be friendly and informative.',
      rateLimitPerUser: 5,
      memoryTimeoutMinutes: 30,
    };
    this.guildConfigs = new Map();
    this.memory = new Map();
    this.rateLimits = new Map();
  }

  async init() {
    await super.init();
    await this._loadConfigs();
    this.logger.info('🧠 AiChatAgent ready' + (this.openai ? '' : ' (disabled – no API key)'));
  }

  async _loadConfigs() {
    if (!this.deps.models?.AIConfig) {
      const db = this.deps.db;
      await db.run(`CREATE TABLE IF NOT EXISTS ai_config (
        guildId TEXT PRIMARY KEY,
        config TEXT
      )`);
      const rows = await db.all(`SELECT guildId, config FROM ai_config`);
      for (const row of rows) {
        this.guildConfigs.set(row.guildId, JSON.parse(row.config));
      }
    } else {
      const configs = await this.deps.models.AIConfig.findAll();
      for (const cfg of configs) {
        this.guildConfigs.set(cfg.guildId, cfg.config);
      }
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    if (!this.openaiApiKey) config.enabled = false;
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

  // ---------- RATE LIMITING ----------
  isRateLimited(userId, config) {
    const now = Date.now();
    const record = this.rateLimits.get(userId);
    if (!record || now > record.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime: now + 60000 });
      return false;
    }
    if (record.count >= config.rateLimitPerUser) return true;
    record.count++;
    return false;
  }

  // ---------- CONVERSATION MEMORY ----------
  getMemory(userId) {
    const mem = this.memory.get(userId);
    if (!mem) return null;
    const timeout = (this.defaultConfig.memoryTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - mem.lastActive > timeout) {
      this.memory.delete(userId);
      return null;
    }
    return mem.messages;
  }

  updateMemory(userId, userMessage, assistantMessage) {
    let messages = this.getMemory(userId) || [];
    messages.push({ role: 'user', content: userMessage });
    messages.push({ role: 'assistant', content: assistantMessage });
    if (messages.length > 20) messages = messages.slice(-20);
    this.memory.set(userId, { messages, lastActive: Date.now() });
  }

  async clearMemory(userId) {
    this.memory.delete(userId);
  }

  // ---------- AI CALLS ----------
  async askAI(userId, prompt, config, systemPromptOverride = null) {
    if (!this.openai) return '❌ AI service is not configured (missing API key).';
    const system = systemPromptOverride || config.systemPrompt;
    const messages = [{ role: 'system', content: system }];
    const history = this.getMemory(userId);
    if (history) messages.push(...history);
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await this.openai.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      });
      const reply = response.choices[0].message.content;
      this.updateMemory(userId, prompt, reply);
      return reply;
    } catch (err) {
      this.logger.error(`OpenAI error for user ${userId}: ${err.message}`);
      return '❌ AI service error. Please try again later.';
    }
  }

  async analyzeSentiment(text) {
    if (!this.openai) return 'unknown';
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Analyze sentiment. Respond with exactly one word: positive, negative, or neutral.' },
          { role: 'user', content: text },
        ],
        max_tokens: 10,
        temperature: 0,
      });
      return response.choices[0].message.content.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

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

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;

    // 🔒 Only handle commands that belong to this agent
    const allowedCommands = ['ask', 'resetai', 'sentiment', 'imagine', 'setai', 'aistats'];
    if (!allowedCommands.includes(interaction.commandName)) return;

    const { commandName, user, guild, member, channel } = interaction;
    const config = await this.getGuildConfig(guild.id);

    // Permission checks (skip for admin command)
    if (commandName !== 'setai') {
      if (!config.enabled && commandName !== 'aistats') {
        return interaction.reply({ content: '❌ AI features are disabled in this server.', ephemeral: true });
      }
      if (config.channelWhitelist.length && !config.channelWhitelist.includes(channel.id)) {
        return interaction.reply({ content: '❌ AI not allowed in this channel.', ephemeral: true });
      }
      if (config.roleWhitelist.length && !member.roles.cache.some(r => config.roleWhitelist.includes(r.id))) {
        return interaction.reply({ content: '❌ You lack permission to use AI.', ephemeral: true });
      }
      if (this.isRateLimited(user.id, config)) {
        return interaction.reply({ content: '⏱️ Slow down! You are using AI too fast.', ephemeral: true });
      }
    }

    switch (commandName) {
      case 'ask':
        await this.cmdAsk(interaction, config);
        break;
      case 'resetai':
        await this.cmdReset(interaction);
        break;
      case 'sentiment':
        await this.cmdSentiment(interaction);
        break;
      case 'imagine':
        await this.cmdImagine(interaction);
        break;
      case 'setai':
        if (!member.permissions.has('Administrator')) return this.deny(interaction);
        await this.cmdSetAi(interaction);
        break;
      case 'aistats':
        await this.cmdStats(interaction);
        break;
    }
  }

  async cmdAsk(interaction, config) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const systemOverride = interaction.options.getString('system') || null;
    const reply = await this.askAI(interaction.user.id, prompt, config, systemOverride);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(reply)
      .setColor(0x00ae86)
      .setFooter({ text: 'AI response • use /resetai to clear context' });
    await interaction.editReply({ embeds: [embed] });
  }

  async cmdReset(interaction) {
    await this.clearMemory(interaction.user.id);
    await interaction.reply({ content: '✅ Conversation context reset.', ephemeral: true });
  }

  async cmdSentiment(interaction) {
    const text = interaction.options.getString('text');
    const sentiment = await this.analyzeSentiment(text);
    const emoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😠' : '😐';
    await interaction.reply({ content: `${emoji} Sentiment: **${sentiment}**`, ephemeral: true });
  }

  async cmdImagine(interaction) {
    if (!this.openai) {
      return interaction.reply({ content: '❌ Image generation unavailable (missing API key).', ephemeral: true });
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

  async cmdSetAi(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = await this.getGuildConfig(interaction.guild.id);
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
    }
  }

  async cmdStats(interaction) {
    const config = await this.getGuildConfig(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Agent Stats')
      .addFields(
        { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
        { name: 'Model', value: config.model, inline: true },
        { name: 'Active conversations', value: this.memory.size.toString(), inline: true },
        { name: 'Rate limit (per min)', value: config.rateLimitPerUser.toString(), inline: true },
        { name: 'Whitelisted channels', value: config.channelWhitelist.length.toString(), inline: true },
        { name: 'OpenAI Key', value: this.openaiApiKey ? '✅ Set' : '❌ Missing', inline: true }
      )
      .setColor(0x3498db);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }
}

module.exports = AiChatAgent;