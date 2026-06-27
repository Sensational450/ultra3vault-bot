/**
 * 🧠 SupportAgent v6.0 – AI‑First, No Hardcoded Content
 * - Answers questions about VIP, payments, balances, referrals, commands, etc.
 * - Uses OpenAI for all responses (if key present)
 * - Falls back to a simple generic message if AI fails
 * - Ignores the AMA channel to prevent conflicts with AMAAgent
 * - Works in DMs and optional #help-support channel
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class SupportAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    this.defaultConfig = {
      enabled: true,
      channelId: null,          // optional dedicated channel (e.g., #help-support)
      respondInDMs: true,
    };
    this.guildConfigs = new Map();

    // OpenAI client (injected via deps)
    this.openai = this.deps.openai || null;
    if (!this.openai && process.env.OPENAI_API_KEY) {
      try {
        this.openai = new (require('openai')).OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
      } catch (err) {
        this.logger.error(`OpenAI init failed: ${err.message}`);
      }
    }
  }

  async init() {
    await super.init();
    await this.loadConfigs();
    this.logger.info('🧠 SupportAgent v6.0 ready' + (this.openai ? ' (AI‑powered)' : ' (fallback only)'));
  }

  async loadConfigs() {
    try {
      const rows = await this.db.all(`SELECT guildId, config FROM guild_configs WHERE configKey = 'support'`);
      for (const row of rows) {
        this.guildConfigs.set(row.guildId, JSON.parse(row.config));
      }
    } catch (err) {
      this.logger.warn(`Could not load support configs: ${err.message}`);
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    this.guildConfigs.set(guildId, config);
    await this.saveConfig(guildId, config);
    return config;
  }

  async saveConfig(guildId, config) {
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, 'support', ?)`,
      [guildId, JSON.stringify(config)]
    );
  }

  async updateConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    await this.saveConfig(guildId, config);
  }

  // ---------- MESSAGE HANDLING ----------
  async onMessage(message) {
    if (message.author.bot) return;
    const isDM = !message.guild;

    // 🚫 Skip AMA channel to avoid conflicts with AMAAgent
    if (message.guild && message.channel.id === process.env.AMA_CHANNEL_ID) {
      return;
    }

    if (isDM) {
      // Always respond to DMs (if enabled globally)
      await this.handleQuery(message, message.author);
      return;
    }

    // Guild message – check config
    const config = await this.getGuildConfig(message.guild.id);
    if (!config.enabled) return;
    if (config.channelId && message.channel.id !== config.channelId) return;

    // Only respond if the message is a question or a mention
    const content = message.content.toLowerCase();
    const isQuestion = content.includes('?') || content.includes('help') || content.includes('support');
    const isMention = message.mentions.has(this.client.user.id);
    if (!isQuestion && !isMention) return;

    await this.handleQuery(message, message.author);
  }

  // ---------- HANDLE A QUERY ----------
  async handleQuery(source, user) {
    const content = source.content;
    let response = null;

    // 1️⃣ Try OpenAI (if available)
    if (this.openai) {
      response = await this.getAIResponse(content);
    }

    // 2️⃣ Fallback (if AI fails or not available)
    if (!response) {
      response = "🤖 I'm here to help! Please ask a specific question about VIP, payments, balances, referrals, or commands. If I can't answer, an admin will assist you shortly.";
    }

    // Send response as an embed
    const embed = new EmbedBuilder()
      .setTitle('🤖 Support')
      .setDescription(response)
      .setColor(0x00ae86)
      .setFooter({ text: 'Need more help? Ask an admin.' });

    await source.reply({ embeds: [embed] }).catch(err => this.logger.error(`Failed to reply: ${err.message}`));
  }

  // ---------- OPENAI CALL ----------
  async getAIResponse(query) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a crypto Discord bot called Ultra3Vault.
            Answer questions about VIP subscriptions, payments, coins, referrals, commands, and general crypto topics.
            Be concise, friendly, and informative. If you don't know the answer, suggest they ask an admin.`
          },
          { role: 'user', content: query }
        ],
        max_tokens: 200,
        temperature: 0.7,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      this.logger.error(`OpenAI fallback error: ${err.message}`);
      return null;
    }
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, guild, member } = interaction;

    switch (commandName) {
      case 'support':
        await interaction.reply({
          content: 'Please ask your question in the `#help-support` channel or DM me directly!',
          ephemeral: true,
        });
        break;

      case 'set-support-channel':
        if (!member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
          return interaction.reply({ content: 'Must be a text channel.', ephemeral: true });
        }
        await this.updateConfig(guild.id, { channelId: channel.id, enabled: true });
        await interaction.reply({ content: `✅ Support channel set to ${channel}.`, ephemeral: true });
        break;

      case 'toggle-support':
        if (!member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        const config = await this.getGuildConfig(guild.id);
        config.enabled = !config.enabled;
        await this.updateConfig(guild.id, { enabled: config.enabled });
        await interaction.reply({
          content: `✅ Support AI ${config.enabled ? 'enabled' : 'disabled'}.`,
          ephemeral: true,
        });
        break;
    }
  }
}

module.exports = SupportAgent;