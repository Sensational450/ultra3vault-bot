/**
 * 👑 VipAgent v5.0
 * - Subscription management (VIP / Premium tiers)
 * - Uses models layer (Subscription, User)
 * - Listens to payment.success and admin events
 * - Handles role assignment/removal
 * - Auto-expiry via scheduler event
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class VipAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Tier definitions (roleIds should be in environment)
    this.tiers = {
      vip: {
        name: 'VIP',
        roleId: process.env.VIP_ROLE_ID,
        price: 500,
        durationDays: 30,
        perks: 'Access to VIP channels, early news',
      },
      premium: {
        name: 'Premium',
        roleId: process.env.PREMIUM_ROLE_ID,
        price: 1500,
        durationDays: 30,
        perks: 'All VIP perks + exclusive signals & airdrop alerts',
      },
    };
    this.subCache = new Map(); // optional cache
  }

  async init() {
    await super.init();
    // Subscribe to expiry check event (scheduled by core/scheduler)
    this.subscribe('job.subscriptionRenewal', async () => {
      await this.checkExpiredSubscriptions();
    });
    this.logger.info('👑 VipAgent ready');
  }

  // ---------- MODELS HELPERS ----------
  async getSubscription(userId, guildId) {
    return await this.deps.models.Subscription.get(userId, guildId);
  }

  async setSubscription(userId, guildId, tier, expiresAt, autoRenew = 0) {
    await this.deps.models.Subscription.set(userId, guildId, tier, expiresAt, autoRenew);
    this.subCache.delete(`${userId}:${guildId}`);
  }

  async deleteSubscription(userId, guildId) {
    await this.deps.models.Subscription.delete(userId, guildId);
    this.subCache.delete(`${userId}:${guildId}`);
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

  // ---------- EXPIRY HANDLER ----------
  async checkExpiredSubscriptions() {
    const expired = await this.deps.models.Subscription.getExpired(Date.now());
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
    // DM user
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (user) {
      user.send(`⚠️ Your **${this.tiers[tier]?.name || tier}** subscription has expired. Use \`/subscribe\` to renew.`).catch(() => {});
    }
    this.eventBus.emit('vip.expired', { userId, guildId, tier });
    this.logger.info(`⌛ Expired ${tier} for user ${userId} in guild ${guildId}`);
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
    // Optionally log payment (if you want to store, uncomment)
    // await this.deps.models.SubscriptionPayment?.create(...)
    this.eventBus.emit('vip.granted', { userId, guildId, tier, expiresAt });
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
    this.eventBus.emit('vip.renewed', { userId, guildId, tier, newExpiry });
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
    this.eventBus.emit('vip.cancelled', { userId, guildId, tier: sub.tier });
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
    const { commandName, member, guild, options } = interaction;

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
        if (!member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        await this.cmdGrantVip(interaction);
        break;
      case 'revokevip':
        if (!member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        await this.cmdRevokeVip(interaction);
        break;
    }
  }

  async cmdVipStatus(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) {
      return interaction.reply({ content: 'You do not have an active subscription.', ephemeral: true });
    }
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
    this.eventBus.emit('vip.purchase.init', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      tier: tierOption,
      price: tierData.price,
    });
    await interaction.reply({
      content: `💰 Starting purchase of **${tierData.name}** for ${tierData.price} coins. Use /balance to check funds.`,
      ephemeral: true,
    });
  }

  async cmdCancel(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) {
      return interaction.reply({ content: 'You have no active subscription to cancel.', ephemeral: true });
    }
    await this.cancelSubscription(interaction.user.id, interaction.guild.id);
    await interaction.reply({ content: `✅ Your ${this.tiers[sub.tier].name} subscription has been cancelled. You will lose access when it expires.`, ephemeral: true });
  }

  async cmdRenew(interaction) {
    const sub = await this.getSubscription(interaction.user.id, interaction.guild.id);
    if (!sub) {
      return interaction.reply({ content: 'You have no active subscription to renew.', ephemeral: true });
    }
    const tierData = this.tiers[sub.tier];
    this.eventBus.emit('vip.renew.init', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      tier: sub.tier,
      price: tierData.price,
    });
    await interaction.reply({ content: `🔄 Renewing your ${tierData.name} subscription for ${tierData.price} coins.`, ephemeral: true });
  }

  async cmdGrantVip(interaction) {
    const target = interaction.options.getUser('user');
    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('days') || 30;
    if (!this.tiers[tier]) {
      return interaction.reply({ content: 'Invalid tier.', ephemeral: true });
    }
    await this.grantSubscription(target.id, interaction.guild.id, tier, days, 0, 'admin');
    await interaction.reply({ content: `✅ Granted **${this.tiers[tier].name}** to ${target.tag} for ${days} days.`, ephemeral: true });
  }

  async cmdRevokeVip(interaction) {
    const target = interaction.options.getUser('user');
    const sub = await this.getSubscription(target.id, interaction.guild.id);
    if (!sub) {
      return interaction.reply({ content: `${target.tag} has no active subscription.`, ephemeral: true });
    }
    await this.cancelSubscription(target.id, interaction.guild.id);
    await interaction.reply({ content: `🔰 Revoked ${this.tiers[sub.tier].name} from ${target.tag}.`, ephemeral: true });
  }
}

module.exports = VipAgent;