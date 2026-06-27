/**
 * 🧠 SupportAgent v7.0 – Hybrid (Local FAQ + AI)
 * - Answers common questions locally (fast, no cost)
 * - Falls back to OpenAI for other queries
 * - Generic fallback message if all fails
 * - Ignores AMA channel to avoid conflicts
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

    // ---- Local FAQ (hardcoded but minimal, always works) ----
    this.faq = new Map([
      ['vip price', '💎 **VIP Subscription** costs **$8 for 30 days**. You can purchase it with `/buy` or `/buytoken`.'],
      ['vip cost', '💎 **VIP Subscription** costs **$8 for 30 days**. Use `/buy` to purchase.'],
      ['vip', '💎 **VIP** gives you access to VIP channels and early news. Price: $8/month.'],
      ['premium price', '💎💎 **Premium** costs **$25 for 30 days**. Includes all VIP perks + exclusive signals & airdrops.'],
      ['premium cost', '💎💎 **Premium** costs **$25/month**. Use `/buy` or `/buytoken`.'],
      ['premium', '💎💎 **Premium** – all VIP perks + signals & airdrops. Price: $25/month.'],
      ['payment', '💳 Payments are processed via **NowPayments** (crypto). After payment, your role is auto-assigned.'],
      ['buy', '💎 Use `/buy` to purchase a subscription with crypto, or `/buytoken` to use in‑bot tokens.'],
      ['subscribe', '💎 Use `/subscribe` to start a subscription. You’ll get a payment link in DMs.'],
      ['balance', '📊 Check your balance with `/balance`. Earn coins daily with `/daily`.'],
      ['referral', '🔗 Get your referral code with `/refer`. Friends use `/redeem <code>` to join. You earn rewards.'],
      ['daily', '🎁 Claim daily rewards with `/daily` once every 24h. Earn 100–500 coins.'],
      ['shop', '🛒 View items with `/shop`. Purchase with `/buy <item_name>` (coins).'],
      ['redeem', '🎟️ Use `/redeem <code>` to redeem referral codes or promo codes.'],
      ['help', '🤖 **Available commands**: `/balance`, `/daily`, `/shop`, `/buy`, `/buytoken`, `/subscribe`, `/refer`, `/redeem`, `/vip`, `/cancel`, `/renew`, `/price`, `/ping`, `/stats`, `/leaderboard`, `/transfer`, `/gamble`, `/inventory`, `/trending-protocols`, `/gecko-trending`, `/social-trends`, `/chain-tvl`, `/global-tvl`. Ask me anything!'],
    ]);

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
    this.logger.info('🧠 SupportAgent v7.0 ready (Local FAQ + ' + (this.openai ? 'AI' : 'fallback') + ')');
  }

  // ---------- Config Helpers ----------
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

  // ---------- Message Handling ----------
  async onMessage(message) {
    if (message.author.bot) return;
    const isDM = !message.guild;

    // 🚫 Skip AMA channel
    if (message.guild && message.channel.id === process.env.AMA_CHANNEL_ID) {
      return;
    }

    if (isDM) {
      await this.handleQuery(message, message.author);
      return;
    }

    const config = await this.getGuildConfig(message.guild.id);
    if (!config.enabled) return;
    if (config.channelId && message.channel.id !== config.channelId) return;

    const content = message.content.toLowerCase();
    const isQuestion = content.includes('?') || content.includes('help') || content.includes('support');
    const isMention = message.mentions.has(this.client.user.id);
    if (!isQuestion && !isMention) return;

    await this.handleQuery(message, message.author);
  }

  // ---------- Handle Query ----------
  async handleQuery(source, user) {
    const content = source.content.toLowerCase();
    let response = null;

    // 1️⃣ Try local FAQ (fast, always works)
    for (const [key, value] of this.faq.entries()) {
      if (content.includes(key)) {
        response = value;
        break;
      }
    }

    // 2️⃣ If no FAQ match, try OpenAI (if available)
    if (!response && this.openai) {
      response = await this.getAIResponse(source.content);
    }

    // 3️⃣ Final fallback (if both fail)
    if (!response) {
      response = "🤖 I'm here to help! Please ask a specific question about VIP, payments, balances, referrals, or commands. If I can't answer, an admin will assist you shortly.";
    }

    // Send reply as embed
    const embed = new EmbedBuilder()
      .setTitle('🤖 Support')
      .setDescription(response)
      .setColor(0x00ae86)
      .setFooter({ text: 'Need more help? Ask an admin.' });

    await source.reply({ embeds: [embed] }).catch(err => this.logger.error(`Failed to reply: ${err.message}`));
  }

  // ---------- OpenAI Call ----------
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

  // ---------- Slash Commands ----------
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