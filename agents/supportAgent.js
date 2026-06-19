/**
 * 🧠 SupportAgent v5.0
 * - Answers FAQs about VIP subscriptions, payments, balances, referrals, etc.
 * - Uses rule-based responses (fast) and falls back to OpenAI (if key present)
 * - Works in DMs and optional #help-support channel
 * - Configurable per guild (enable/disable, channel override)
 * - Safe error handling – never crashes
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
      useAI: !!process.env.OPENAI_API_KEY,
    };
    this.guildConfigs = new Map();
    // Keyword-based FAQ map
    this.faq = new Map([
      ['vip', '💎 **VIP Subscription**\n• Price: $5 for 30 days\n• Perks: Access to VIP channels, early news\n• Purchase: `/buy 30d`'],
      ['premium', '💎 **Premium Subscription**\n• Price: $15 for 30 days\n• Perks: All VIP perks + exclusive signals & airdrops\n• Purchase: `/buy 30d` and choose `premium`'],
      ['price', '💰 **VIP Pricing**\n• 7 days: $5\n• 14 days: $9\n• 30 days: $15\n\nUse `/buy 7d` to purchase.'],
      ['payment', '💳 **Payment Info**\n• Payments are processed via NowPayments (crypto).\n• You will receive a payment link after `/buy`.\n• After payment, your VIP role is automatically assigned.'],
      ['balance', '📊 **Check your balance** with `/balance`.\n• Earn coins daily with `/daily`.\n• Transfer coins with `/transfer`.'],
      ['referral', '🔗 **Referral System**\n• Get your referral code with `/refer`.\n• Friends use `/redeem <code>` to claim rewards.\n• You earn coins for each successful referral.'],
      ['daily', '🎁 **Daily Rewards**\n• Claim once every 24h with `/daily`.\n• Reward amount: 100–500 coins.'],
      ['shop', '🛒 **Shop**\n• View items with `/shop`.\n• Purchase with `/buy <item_name>` (coins).'],
      ['buy', '💎 **Purchase VIP**\n• Use `/buy 7d` / `/buy 14d` / `/buy 30d`.\n• You\'ll receive a payment link.'],
      ['redeem', '🎟️ **Redeem**\n• Use `/redeem <code>` to claim referral rewards or promo codes.'],
      ['help', '🤖 **Available Commands**\n• `/balance`, `/daily`, `/shop`, `/buy`, `/refer`, `/redeem`, `/vip`, `/subscribe`, `/cancel`, `/renew`, `/price`, `/ping`, `/stats`, `/leaderboard`, `/transfer`, `/gamble`, `/inventory`, `/trending-protocols`, `/gecko-trending`, `/social-trends`, `/chain-tvl`, `/global-tvl`\n• For more, ask me anything!'],
    ]);
  }

  async init() {
    await super.init();
    // Load guild configs (stored in guild_configs table)
    await this.loadConfigs();
    this.logger.info('🧠 SupportAgent ready' + (this.deps.openai ? ' (AI‑powered)' : ' (rule‑based)'));
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
    const content = source.content.toLowerCase();
    // 1️⃣ Try rule‑based FAQ
    let response = null;
    for (const [key, value] of this.faq.entries()) {
      if (content.includes(key)) {
        response = value;
        break;
      }
    }

    // 2️⃣ If no match, try OpenAI (if available)
    if (!response && this.deps.openai) {
      response = await this.getAIResponse(content);
    }

    // 3️⃣ Fallback to generic response
    if (!response) {
      response = "❓ I'm not sure about that. Try asking about `VIP`, `payment`, `balance`, `referral`, or `help`. You can also use `/help` for a list of commands.";
    }

    // Send response
    const embed = new EmbedBuilder()
      .setTitle('🤖 Support')
      .setDescription(response)
      .setColor(0x00ae86)
      .setFooter({ text: 'Need more help? Ask an admin.' });
    await source.reply({ embeds: [embed] }).catch(err => this.logger.error(`Failed to reply: ${err.message}`));
  }

  // ---------- OPENAI FALLBACK ----------
  async getAIResponse(query) {
    try {
      const openai = this.deps.openai;
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for a crypto Discord bot called Ultra3Vault. Answer questions about VIP subscriptions, payments, coins, referrals, and commands. Be concise and friendly.' },
          { role: 'user', content: query },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });
      return response.choices[0].message.content;
    } catch (err) {
      this.logger.error(`OpenAI fallback error: ${err.message}`);
      return null;
    }
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, guild, member } = interaction;
    if (commandName === 'support') {
      await interaction.reply({ content: 'Please ask your question in the `#help-support` channel or DM me directly!', ephemeral: true });
    }
    if (commandName === 'set-support-channel' && member.permissions.has('Administrator')) {
      const channel = interaction.options.getChannel('channel');
      if (!channel.isTextBased()) return interaction.reply({ content: 'Must be a text channel.', ephemeral: true });
      await this.updateConfig(guild.id, { channelId: channel.id, enabled: true });
      await interaction.reply({ content: `✅ Support channel set to ${channel}.`, ephemeral: true });
    }
    if (commandName === 'toggle-support' && member.permissions.has('Administrator')) {
      const config = await this.getGuildConfig(guild.id);
      config.enabled = !config.enabled;
      await this.updateConfig(guild.id, { enabled: config.enabled });
      await interaction.reply({ content: `✅ Support AI ${config.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }
  }
}

module.exports = SupportAgent;