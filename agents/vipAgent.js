/**
 * 👑 VipAgent v6.0 (Persistent + Trial System)
 * - Subscription management (VIP / Premium tiers)
 * - Trial system: claim, status, expiry, admin grant
 * - Uses models layer (Subscription) – fully persistent
 * - Listens to payment.success and admin events
 * - Handles role assignment/removal
 * - Auto-expiry via scheduler event
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

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
      },
      premium: {
        name: 'Premium',
        roleId: process.env.PREMIUM_ROLE_ID,
        priceUSD: 15,
        priceCoins: 1500,
        durationDays: 30,
        perks: 'All VIP perks + exclusive signals & airdrop alerts',
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
    // Trial expiry job (optional – we'll also schedule separately)
    this.subscribe('job.trialExpiry', async () => {
      await this.expireTrials();
    });
    // Ensure trial table exists
    await this._ensureTrialTable();
    this.logger.info('👑 VipAgent v6.0 ready (with Trial System)');
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

  // ---------- MODELS HELPERS (persistent) ----------
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
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.removeRole(member, tier);
    }
    await this.deleteSubscription(userId, guildId);
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (user) {
      user.send(`⚠️ Your **${this.tiers[tier]?.name || tier}** subscription has expired. Use \`/subscribe\` to renew.`).catch(() => {});
    }
    this.emit('vip.expired', { userId, guildId, tier });
    this.logger.info(`⌛ Expired ${tier} for user ${userId} in guild ${guildId}`);
  }

  // ===================== TRIAL SYSTEM =====================

  /**
   * 🎟️ Claim a free trial for VIP or Premium
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID
   * @param {string} tier - 'vip' or 'premium'
   * @param {number} durationDays - Number of days (default 3)
   * @returns {Promise<{ success: boolean, message: string, expiresAt: Date }>}
   */
  async claimTrial(userId, guildId, tier, durationDays = this.trialDurationDays) {
    if (!this.tiers[tier]) {
      return { success: false, message: 'Invalid tier. Choose vip or premium.' };
    }

    // Check if user already has an active trial for this tier
    const existing = await this.db.get(
      `SELECT * FROM user_trials WHERE userId = ? AND guildId = ? AND tier = ? AND used = 0`,
      [userId, guildId, tier]
    );
    if (existing) {
      return { success: false, message: `You already have an active ${tier.toUpperCase()} trial.` };
    }

    // Check if user already used a trial for this tier
    const used = await this.db.get(
      `SELECT * FROM user_trials WHERE userId = ? AND guildId = ? AND tier = ? AND used = 1`,
      [userId, guildId, tier]
    );
    if (used) {
      return { success: false, message: `You already used your ${tier.toUpperCase()} trial.` };
    }

    // Check if user already has an active subscription for this tier
    const subscription = await this.getSubscription(userId, guildId);
    if (subscription && subscription.tier === tier && subscription.expiresAt > Date.now()) {
      return { success: false, message: `You already have an active ${tier.toUpperCase()} subscription.` };
    }

    const now = Date.now();
    const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;

    // Save trial to database
    await this.db.run(
      `INSERT INTO user_trials (userId, guildId, tier, claimedAt, expiresAt, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, guildId, tier, now, expiresAt]
    );

    // Grant temporary access (assign role)
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

  /**
   * 🔄 Check and expire expired trials (run by scheduler)
   * @returns {Promise<number>} - Number of expired trials
   */
  async expireTrials() {
    const now = Date.now();
    const expired = await this.db.all(
      `SELECT * FROM user_trials WHERE expiresAt < ? AND used = 0`,
      [now]
    );

    for (const trial of expired) {
      // Mark as used (expired)
      await this.db.run(
        `UPDATE user_trials SET used = 1 WHERE id = ?`,
        [trial.id]
      );
      // Remove role
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

  /**
   * 📊 Get trial status for a user
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>}
   */
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

  /**
   * 🎁 Admin: Grant trial to a user
   * @param {string} adminUserId - Admin Discord user ID
   * @param {string} targetUserId - Target Discord user ID
   * @param {string} guildId - Discord guild ID
   * @param {string} tier - 'vip' or 'premium'
   * @param {number} durationDays - Number of days
   */
  async adminGrantTrial(adminUserId, targetUserId, guildId, tier, durationDays = this.trialDurationDays) {
    // Check admin permissions (handled in command)
    const result = await this.claimTrial(targetUserId, guildId, tier, durationDays);
    if (result.success) {
      this.logger.info(`🎁 Admin ${adminUserId} granted ${tier} trial to ${targetUserId}`);
    }
    return result;
  }

  // ---------- GRANT / RENEW / CANCEL ----------
  async grantSubscription(userId, guildId, tier, durationDays = null, autoRenew = 0, paymentMethod = 'manual') {
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    const duration = durationDays || tierData.durationDays;
    const expiresAt = Date.now() + duration * 24 * 60 * 60 * 1000;

    // Remove old role if exists
    const existing = await this.getSubscription(userId, guildId);
    if (existing) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await this.removeRole(member, existing.tier);
      }
    }
    await this.setSubscription(userId, guildId, tier, expiresAt, autoRenew);
    // Assign new role
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.assignRole(member, tier);
    }
    this.emit('vip.granted', { userId, guildId, tier, expiresAt });
    this.logger.info(`🎁 Granted ${tier} to ${userId} until ${new Date(expiresAt).toISOString()}`);
    return expiresAt;
  }

  async renewSubscription(userId, guildId, tier, additionalDays = null, paymentMethod = 'manual') {
    const existing = await this.getSubscription(userId, guildId);
    const tierData = this.tiers[tier];
    const days = additionalDays || tierData.durationDays;
    let newExpiry;
    if (!existing) {
      newExpiry = await this.grantSubscription(userId, guildId, tier, days, 0, paymentMethod);
    } else {
      newExpiry = existing.expiresAt > Date.now()
        ? existing.expiresAt + days * 24 * 60 * 60 * 1000
        : Date.now() + days * 24 * 60 * 60 * 1000;
      await this.setSubscription(userId, guildId, tier, newExpiry, existing.autoRenew);
    }
    this.emit('vip.renewed', { userId, guildId, tier, newExpiry });
    return newExpiry;
  }

  async cancelSubscription(userId, guildId) {
    const sub = await this.getSubscription(userId, guildId);
    if (!sub) return false;
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.removeRole(member, sub.tier);
    }
    await this.deleteSubscription(userId, guildId);
    this.emit('vip.cancelled', { userId, guildId, tier: sub.tier });
    return true;
  }

  // ---------- EVENT BUS LISTENERS ----------
  setupListeners() {
    this.subscribe('payment.success', async (data) => {
      const { userId, guildId, tier } = data;
      if (this.tiers[tier]) {
        await this.grantSubscription(userId, guildId, tier, null, 0, 'crypto');
      } else {
        this.logger.warn(`Unknown tier ${tier} in payment.success`);
      }
    });

    this.subscribe('economy.rolePurchased', async (data) => {
      for (const [tierKey, tierVal] of Object.entries(this.tiers)) {
        if (tierVal.roleId === data.roleId) {
          await this.grantSubscription(data.userId, data.guildId, tierKey, null, 0, 'coins');
          break;
        }
      }
    });

    this.subscribe('admin.vip.grant', async (data) => {
      await this.grantSubscription(data.userId, data.guildId, data.tier, data.durationDays, 0, 'admin');
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
      // Trial commands
      case 'trial':
        await this.cmdTrial(interaction);
        break;
    }
  }

  // ---------- TRIAL SLASH COMMAND ----------
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

  // ---------- EXISTING COMMAND HANDLERS ----------
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
    });
    await interaction.reply({
      content: `💰 Starting purchase of **${tierData.name}** for ${tierData.priceCoins} coins. Use /balance to check funds.`,
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
    await this.grantSubscription(target.id, interaction.guild.id, tier, days, 0, 'admin');
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