/**
 * 👑 VipAgent v6.4 (Centralized Webhooks)
 * - All subscription events now post to designated webhooks via sendWebhook(key, payload)
 * - Uses WebhookSender.buildUltraEmbed for consistent branding
 * - No more direct env var access for webhook URLs
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const WebhookSender = require('../tools/discord/webhookSender'); // for buildUltraEmbed only
const { sendWebhook } = require('../index'); // ✅ centralized webhook sender

class VipAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Tier definitions (roleIds from environment)
    this.tiers = {
      vip: {
        name: 'VIP',
        roleId: process.env.VIP_ROLE_ID,
        priceUSD: 5,
        priceCoins: 500,
        durationDays: 30,
        perks: 'Access to VIP channels, early news',
        webhookKey: 'vipNews', // 👈 maps to WEBHOOKS in index.js
      },
      premium: {
        name: 'Premium',
        roleId: process.env.PREMIUM_ROLE_ID,
        priceUSD: 15,
        priceCoins: 1500,
        durationDays: 30,
        perks: 'All VIP perks + exclusive signals & airdrop alerts',
        webhookKey: 'premiumSignals',
      },
    };

    // Plan-based pricing (USD and tokens)
    this.planPricing = {
      vip: {
        7:  { usd: 2.00, tokens: 120 },
        14: { usd: 4.00, tokens: 240 },
        30: { usd: 8.00, tokens: 500 },
      },
      premium: {
        7:  { usd: 6.00, tokens: 350 },
        14: { usd: 12.00, tokens: 700 },
        30: { usd: 25.00, tokens: 1500 },
      },
    };

    // Trial configuration
    this.trialDurationDays = parseInt(process.env.TRIAL_DURATION_DAYS) || 3;
    this.trialCooldownDays = parseInt(process.env.TRIAL_COOLDOWN_DAYS) || 30;
  }

  async init() {
    await super.init();
    this.subscribe('job.subscriptionRenewal', async () => {
      await this.checkExpiredSubscriptions();
    });
    this.subscribe('job.trialExpiry', async () => {
      await this.expireTrials();
    });
    await this._ensureTrialTable();
    this.logger.info('👑 VipAgent v6.4 ready (centralized webhooks)');
  }

  // ---------- WEBHOOK HELPER (centralized) ----------
  async sendWebhookMessage(key, embed) {
    try {
      await sendWebhook(key, { embeds: [embed] });
    } catch (err) {
      this.logger.warn(`Webhook send failed for ${key}: ${err.message}`);
    }
  }

  // ---------- DATABASE HELPERS ----------
  async _ensureTrialTable() {
    try {
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_trials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          guildId TEXT NOT NULL,
          tier TEXT NOT NULL,
          claimedAt INTEGER NOT NULL,
          expiresAt INTEGER NOT NULL,
          used BOOLEAN DEFAULT 0,
          UNIQUE(userId, guildId, tier)
        )
      `);
      await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user_trials_userId ON user_trials(userId)`);
      await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user_trials_expiresAt ON user_trials(expiresAt)`);
    } catch (err) {
      this.logger.error(`Failed to create trial table: ${err.message}`);
    }
  }

  // ---------- MODELS HELPERS ----------
  async getSubscription(userId, guildId) {
    return await this.models.Subscription.get(userId, guildId);
  }

  async setSubscription(userId, guildId, tier, expiresAt, autoRenew = 0) {
    await this.models.Subscription.set(userId, guildId, tier, expiresAt, autoRenew);
  }

  async deleteSubscription(userId, guildId) {
    await this.models.Subscription.delete(userId, guildId);
  }

  // ---------- ROLE MANAGEMENT ----------
  async assignRole(member, tier) {
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    if (!tierData.roleId) {
      this.logger.warn(`⚠️ No roleId configured for tier ${tier}`);
      return false;
    }
    const role = member.guild.roles.cache.get(tierData.roleId);
    if (!role) {
      this.logger.error(`❌ Role ${tierData.roleId} not found for tier ${tier}`);
      return false;
    }
    await member.roles.add(role).catch(err => this.logger.error(`Failed to add role: ${err.message}`));
    return true;
  }

  async removeRole(member, tier) {
    const tierData = this.tiers[tier];
    if (!tierData || !tierData.roleId) return;
    const role = member.guild.roles.cache.get(tierData.roleId);
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role).catch(err => this.logger.error(`Failed to remove role: ${err.message}`));
    }
  }

  // ---------- SUBSCRIPTION EXPIRY ----------
  async checkExpiredSubscriptions() {
    const expired = await this.models.Subscription.getExpired(Date.now());
    for (const sub of expired) {
      await this.expireSubscription(sub.userId, sub.guildId, sub.tier);
    }
    this.logger.info(`👑 Checked subscriptions: ${expired.length} expired`);
  }

  async expireSubscription(userId, guildId, tier) {
    const guild = this.client.guilds.cache.get(guildId);
    let userTag = 'Unknown';
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.removeRole(member, tier);
    }
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (user) {
      userTag = user.tag;
      user.send(`⚠️ Your **${this.tiers[tier]?.name || tier}** subscription has expired. Use \`/subscribe\` to renew.`).catch(() => {});
    }
    await this.deleteSubscription(userId, guildId);
    this.emit('vip.expired', { userId, guildId, tier });

    // ➕ Post expiry notification to webhook
    const tierData = this.tiers[tier];
    if (tierData && tierData.webhookKey) {
      const embed = WebhookSender.buildUltraEmbed({
        title: `⏳ ${tierData.name} Subscription Expired`,
        description: `${userTag} has lost access to ${tierData.name} benefits.`,
        color: 0xE74C3C,
        footer: 'Ultra3Vault • Auto-expired',
      });
      await this.sendWebhookMessage(tierData.webhookKey, embed);
    }

    this.logger.info(`⌛ Expired ${tier} for user ${userId} in guild ${guildId}`);
  }

  // ===================== TRIAL SYSTEM =====================
  async claimTrial(userId, guildId, tier, durationDays = this.trialDurationDays) {
    if (!this.tiers[tier]) {
      return { success: false, message: 'Invalid tier. Choose vip or premium.' };
    }
    const existing = await this.db.get(
      `SELECT * FROM user_trials WHERE userId = ? AND guildId = ? AND tier = ? AND used = 0`,
      [userId, guildId, tier]
    );
    if (existing) {
      return { success: false, message: `You already have an active ${tier.toUpperCase()} trial.` };
    }
    const used = await this.db.get(
      `SELECT * FROM user_trials WHERE userId = ? AND guildId = ? AND tier = ? AND used = 1`,
      [userId, guildId, tier]
    );
    if (used) {
      return { success: false, message: `You already used your ${tier.toUpperCase()} trial.` };
    }
    const subscription = await this.getSubscription(userId, guildId);
    if (subscription && subscription.tier === tier && subscription.expiresAt > Date.now()) {
      return { success: false, message: `You already have an active ${tier.toUpperCase()} subscription.` };
    }
    const now = Date.now();
    const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;
    await this.db.run(
      `INSERT INTO user_trials (userId, guildId, tier, claimedAt, expiresAt, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, guildId, tier, now, expiresAt]
    );
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.assignRole(member, tier);
    }
    this.logger.info(`🎟️ ${tier.toUpperCase()} trial claimed by ${userId} (expires in ${durationDays} days)`);
    return {
      success: true,
      message: `🎉 ${tier.toUpperCase()} trial activated! You have ${durationDays} days of free access.`,
      expiresAt: new Date(expiresAt),
    };
  }

  async expireTrials() {
    const now = Date.now();
    const expired = await this.db.all(
      `SELECT * FROM user_trials WHERE expiresAt < ? AND used = 0`,
      [now]
    );
    for (const trial of expired) {
      await this.db.run(`UPDATE user_trials SET used = 1 WHERE id = ?`, [trial.id]);
      const guild = this.client.guilds.cache.get(trial.guildId);
      if (guild) {
        const member = await guild.members.fetch(trial.userId).catch(() => null);
        if (member) await this.removeRole(member, trial.tier);
      }
      this.logger.info(`⏰ ${trial.tier.toUpperCase()} trial expired for ${trial.userId}`);
    }
    if (expired.length > 0) {
      this.emit('vip.trialsExpired', { count: expired.length });
    }
    return expired.length;
  }

  async getTrialStatus(userId, guildId) {
    const trials = await this.db.all(
      `SELECT * FROM user_trials WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    const active = trials.filter(t => t.used === 0 && t.expiresAt > Date.now());
    const expired = trials.filter(t => t.used === 1 || t.expiresAt <= Date.now());
    return {
      active: active.map(t => ({
        tier: t.tier,
        expiresAt: new Date(t.expiresAt),
        claimedAt: new Date(t.claimedAt),
      })),
      expired: expired.length,
      total: trials.length,
    };
  }

  async adminGrantTrial(adminUserId, targetUserId, guildId, tier, durationDays = this.trialDurationDays) {
    const result = await this.claimTrial(targetUserId, guildId, tier, durationDays);
    if (result.success) {
      this.logger.info(`🎁 Admin ${adminUserId} granted ${tier} trial to ${targetUserId}`);
    }
    return result;
  }

  // ---------- GRANT / RENEW / CANCEL ----------
  /**
   * Grant or extend a subscription
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID
   * @param {string} tier - 'vip' or 'premium'
   * @param {number|null} durationDays - Days to add (if null, uses tier default)
   * @param {number} autoRenew - 0/1
   * @param {string} paymentMethod - 'manual', 'crypto', 'tokens', 'admin'
   * @param {boolean} extend - If true and subscription exists, add to existing expiry
   * @returns {Promise<number>} - New expiry timestamp
   */
  async grantSubscription(userId, guildId, tier, durationDays = null, autoRenew = 0, paymentMethod = 'manual', extend = false) {
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    const duration = durationDays || tierData.durationDays;

    let expiresAt;
    const existing = await this.getSubscription(userId, guildId);

    if (existing && extend && existing.expiresAt > Date.now()) {
      // Extend existing subscription
      expiresAt = existing.expiresAt + duration * 24 * 60 * 60 * 1000;
      await this.setSubscription(userId, guildId, tier, expiresAt, autoRenew);
      this.logger.info(`↗️ Extended ${tier} for ${userId} by ${duration} days (new expiry: ${new Date(expiresAt).toISOString()})`);
    } else {
      // New subscription or replace expired one
      expiresAt = Date.now() + duration * 24 * 60 * 60 * 1000;
      // Remove any old role first
      if (existing) {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) await this.removeRole(member, existing.tier);
        }
      }
      await this.setSubscription(userId, guildId, tier, expiresAt, autoRenew);
      this.logger.info(`🎁 Granted ${tier} to ${userId} until ${new Date(expiresAt).toISOString()}`);
    }

    // Assign the role (if not already assigned)
    const guild = this.client.guilds.cache.get(guildId);
    let userTag = 'Unknown';
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await this.assignRole(member, tier);
        userTag = member.user.tag;
      }
    }

    this.emit('vip.granted', { userId, guildId, tier, expiresAt, paymentMethod });

    // ➕ Post subscription announcement to webhook
    if (tierData.webhookKey) {
      const embed = WebhookSender.buildUltraEmbed({
        title: `✨ ${tierData.name} Subscription ${existing && extend ? 'Extended' : 'Activated'}`,
        description: `${userTag} has ${existing && extend ? 'extended' : 'gained'} access to **${tierData.name}** benefits for **${duration} days**.`,
        fields: [
          { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true },
          { name: 'Payment Method', value: paymentMethod, inline: true },
        ],
        color: 0x9B59B6,
        footer: `Ultra3Vault • ${paymentMethod} purchase`,
      });
      await this.sendWebhookMessage(tierData.webhookKey, embed);
    }

    return expiresAt;
  }

  async renewSubscription(userId, guildId, tier, additionalDays = null, paymentMethod = 'manual') {
    return this.grantSubscription(userId, guildId, tier, additionalDays, 0, paymentMethod, true);
  }

  async cancelSubscription(userId, guildId) {
    const sub = await this.getSubscription(userId, guildId);
    if (!sub) return false;
    const tierData = this.tiers[sub.tier];
    const guild = this.client.guilds.cache.get(guildId);
    let userTag = 'Unknown';
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await this.removeRole(member, sub.tier);
        userTag = member.user.tag;
      }
    }
    await this.deleteSubscription(userId, guildId);
    this.emit('vip.cancelled', { userId, guildId, tier: sub.tier });

    // ➕ Post cancellation notification to webhook
    if (tierData && tierData.webhookKey) {
      const embed = WebhookSender.buildUltraEmbed({
        title: `🚫 ${tierData.name} Subscription Cancelled`,
        description: `${userTag} has cancelled their ${tierData.name} subscription. Access will continue until expiry.`,
        color: 0xE74C3C,
        footer: 'Ultra3Vault • Cancellation',
      });
      await this.sendWebhookMessage(tierData.webhookKey, embed);
    }

    return true;
  }

  // ===================== PRICING HELPERS =====================
  getTokenCost(tier, days) {
    const plan = this.planPricing[tier]?.[days];
    if (plan) return plan.tokens;
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    return Math.ceil((tierData.priceCoins / tierData.durationDays) * days);
  }

  getUsdCost(tier, days) {
    const plan = this.planPricing[tier]?.[days];
    if (plan) return plan.usd;
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    return parseFloat(((tierData.priceUSD / tierData.durationDays) * days).toFixed(2));
  }

  async purchaseWithTokens(userId, guildId, tier, days, economyAgent) {
    const tierData = this.tiers[tier];
    if (!tierData) {
      return { success: false, message: 'Invalid tier. Choose vip or premium.' };
    }
    if (![7, 14, 30].includes(days)) {
      return { success: false, message: 'Invalid plan. Choose 7, 14, or 30 days.' };
    }

    const totalCost = this.getTokenCost(tier, days);
    if (!economyAgent) {
      return { success: false, message: 'Economy system not available.' };
    }
    const balance = await economyAgent.getBalance(userId, guildId);
    if (balance < totalCost) {
      return {
        success: false,
        message: `❌ Insufficient tokens. You need **${totalCost}** tokens, but you have **${balance}**. Earn more via \`/daily\` or \`/referral\`.`,
      };
    }

    const deducted = await economyAgent.deductBalance(userId, guildId, totalCost, `Purchased ${tier} for ${days} days`);
    if (!deducted) {
      return { success: false, message: 'Failed to deduct tokens. Please try again.' };
    }

    const expiresAt = await this.grantSubscription(userId, guildId, tier, days, 0, 'tokens', true);

    this.logger.info(`💰 User ${userId} purchased ${tier} for ${days} days using ${totalCost} tokens (extended)`);

    return {
      success: true,
      message: `✅ **${tierData.name}** unlocked for **${days} days**! Expires: <t:${Math.floor(expiresAt / 1000)}:R>.`,
      expiresAt: new Date(expiresAt),
    };
  }

  // ---------- EVENT BUS LISTENERS ----------
  setupListeners() {
    this.subscribe('payment.success', async (data) => {
      const { userId, guildId, tier, days } = data;
      if (this.tiers[tier]) {
        await this.grantSubscription(userId, guildId, tier, days || null, 0, 'crypto', true);
      } else {
        this.logger.warn(`Unknown tier ${tier} in payment.success`);
      }
    });

    this.subscribe('economy.rolePurchased', async (data) => {
      for (const [tierKey, tierVal] of Object.entries(this.tiers)) {
        if (tierVal.roleId === data.roleId) {
          await this.grantSubscription(data.userId, data.guildId, tierKey, null, 0, 'coins', true);
          break;
        }
      }
    });

    this.subscribe('admin.vip.grant', async (data) => {
      await this.grantSubscription(data.userId, data.guildId, data.tier, data.durationDays, 0, 'admin', false);
    });
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, member, guild } = interaction;

    switch (commandName) {
      case 'vip':
        await this.cmdVipStatus(interaction);
        break;
      case 'subscribe':
        await this.cmdSubscribe(interaction);
        break;
      case 'cancel':
        await this.cmdCancel(interaction);
        break;
      case 'renew':
        await this.cmdRenew(interaction);
        break;
      case 'grantvip':
        if (!member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        await this.cmdGrantVip(interaction);
        break;
      case 'revokevip':
        if (!member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        await this.cmdRevokeVip(interaction);
        break;
      case 'trial':
        await this.cmdTrial(interaction);
        break;
      case 'buytoken':
        await this.cmdBuyToken(interaction);
        break;
    }
  }

  // ---------- COMMAND HANDLERS ----------
  async cmdBuyToken(interaction) {
    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('plan');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const economyAgent = this.deps.orchestrator?.getAgent('EconomyAgent');
    if (!economyAgent) {
      return interaction.reply({ content: '❌ Economy system not available.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.purchaseWithTokens(userId, guildId, tier, days, economyAgent);
      await interaction.editReply({ content: result.message });
    } catch (err) {
      await interaction.editReply({ content: `❌ Purchase failed: ${err.message}` });
    }
  }

  async cmdTrial(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (sub === 'claim') {
      const tier = interaction.options.getString('tier');
      const result = await this.claimTrial(userId, guildId, tier);
      await interaction.reply({
        content: result.message,
        ephemeral: !result.success,
      });
    } else if (sub === 'status') {
      const status = await this.getTrialStatus(userId, guildId);
      let msg = '📋 **Trial Status**\n\n';
      if (status.active.length === 0) {
        msg += '❌ No active trials.\n';
      }
      for (const t of status.active) {
        const daysLeft = Math.ceil((t.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        msg += `• ${t.tier.toUpperCase()}: ${daysLeft} days left\n`;
      }
      msg += `\n📊 Total trials: ${status.total} (${status.expired} expired)`;
      await interaction.reply({ content: msg, ephemeral: true });
    } else if (sub === 'admin') {
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      const tier = interaction.options.getString('tier');
      const days = interaction.options.getInteger('days') || this.trialDurationDays;
      const result = await this.adminGrantTrial(
        interaction.user.id,
        target.id,
        interaction.guild.id,
        tier,
        days
      );
      await interaction.reply({
        content: result.message || `✅ ${tier.toUpperCase()} trial granted to ${target} for ${days} days.`,
        ephemeral: true,
      });
    }
  }

  async cmdVipStatus(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) return interaction.reply({ content: 'You do not have an active subscription.', ephemeral: true });
    const tierData = this.tiers[sub.tier];
    if (!tierData) return interaction.reply({ content: 'Unknown tier.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`✨ Your ${tierData.name} Subscription`)
      .addFields(
        { name: 'Tier', value: tierData.name, inline: true },
        { name: 'Expires', value: `<t:${Math.floor(sub.expiresAt / 1000)}:R>`, inline: true },
        { name: 'Auto-renew', value: sub.autoRenew ? 'Yes' : 'No', inline: true },
        { name: 'Perks', value: tierData.perks }
      )
      .setColor(0x9b59b6);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdSubscribe(interaction) {
    const tierOption = interaction.options.getString('tier');
    if (!this.tiers[tierOption]) {
      return interaction.reply({ content: `Invalid tier. Choose: ${Object.keys(this.tiers).join(', ')}`, ephemeral: true });
    }
    const tierData = this.tiers[tierOption];
    this.emit('vip.purchase.init', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      tier: tierOption,
      price: tierData.priceCoins,
      days: 30,
    });
    await interaction.reply({
      content: `💰 Starting purchase of **${tierData.name}** for ${tierData.priceCoins} coins (30 days). Use /balance to check funds.`,
      ephemeral: true,
    });
  }

  async cmdCancel(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) return interaction.reply({ content: 'You have no active subscription to cancel.', ephemeral: true });
    await this.cancelSubscription(interaction.user.id, interaction.guild.id);
    await interaction.reply({ content: `✅ Your ${this.tiers[sub.tier].name} subscription has been cancelled. You will lose access when it expires.`, ephemeral: true });
  }

  async cmdRenew(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) return interaction.reply({ content: 'You have no active subscription to renew.', ephemeral: true });
    const tierData = this.tiers[sub.tier];
    this.emit('vip.renew.init', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      tier: sub.tier,
      price: tierData.priceCoins,
    });
    await interaction.reply({ content: `🔄 Renewing your ${tierData.name} subscription for ${tierData.priceCoins} coins.`, ephemeral: true });
  }

  async cmdGrantVip(interaction) {
    const target = interaction.options.getUser('user');
    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('days') || 30;
    if (!this.tiers[tier]) return interaction.reply({ content: 'Invalid tier.', ephemeral: true });
    await this.grantSubscription(target.id, interaction.guild.id, tier, days, 0, 'admin', false);
    await interaction.reply({ content: `✅ Granted **${this.tiers[tier].name}** to ${target.tag} for ${days} days.`, ephemeral: true });
  }

  async cmdRevokeVip(interaction) {
    const target = interaction.options.getUser('user');
    const sub = await this.getSubscription(target.id, interaction.guild.id);
    if (!sub) return interaction.reply({ content: `${target.tag} has no active subscription.`, ephemeral: true });
    await this.cancelSubscription(target.id, interaction.guild.id);
    await interaction.reply({ content: `🔰 Revoked ${this.tiers[sub.tier].name} from ${target.tag}.`, ephemeral: true });
  }
}

module.exports = VipAgent;