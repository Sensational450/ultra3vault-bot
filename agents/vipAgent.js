const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class VipAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Tier definitions
    this.tiers = {
      vip: {
        name: 'VIP',
        roleId: process.env.VIP_ROLE_ID,
        price: 500,          // in your currency (e.g., coins or USD cents)
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
    // Subscription cache (optional)
    this.subCache = new Map(); // userId -> { tier, expiresAt, guildId }
  }

  async init() {
    await super.init();
    await this.initDatabase();
    // Schedule daily expiry check (at midnight)
    this.subscribe('job.subscriptionRenewal', async () => {
      await this.checkExpiredSubscriptions();
    });
    this.logger.info('VipAgent ready');
  }

  async initDatabase() {
    const db = this.deps.db;
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      userId TEXT,
      guildId TEXT,
      tier TEXT,
      expiresAt INTEGER,   -- unix timestamp (ms)
      autoRenew INTEGER DEFAULT 0,
      PRIMARY KEY (userId, guildId)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      guildId TEXT,
      tier TEXT,
      amount INTEGER,
      paymentMethod TEXT,
      createdAt INTEGER
    )`);
  }

  // ---------- DATABASE HELPERS ----------
  async getSubscription(userId, guildId) {
    const db = this.deps.db;
    return new Promise((resolve, reject) => {
      db.get(`SELECT tier, expiresAt, autoRenew FROM subscriptions WHERE userId = ? AND guildId = ?`,
        [userId, guildId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
    });
  }

  async setSubscription(userId, guildId, tier, expiresAt, autoRenew = 0) {
    const db = this.deps.db;
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO subscriptions (userId, guildId, tier, expiresAt, autoRenew)
              VALUES (?, ?, ?, ?, ?)`,
              [userId, guildId, tier, expiresAt, autoRenew], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Invalidate cache
    this.subCache.delete(`${userId}:${guildId}`);
  }

  async deleteSubscription(userId, guildId) {
    const db = this.deps.db;
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM subscriptions WHERE userId = ? AND guildId = ?`, [userId, guildId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.subCache.delete(`${userId}:${guildId}`);
  }

  async logPayment(userId, guildId, tier, amount, method) {
    const db = this.deps.db;
    db.run(`INSERT INTO subscription_payments (userId, guildId, tier, amount, paymentMethod, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)`, [userId, guildId, tier, amount, method, Date.now()]);
  }

  // ---------- ROLE MANAGEMENT ----------
  async assignRole(member, tier) {
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    const role = member.guild.roles.cache.get(tierData.roleId);
    if (!role) {
      this.logger.error(`Role ${tierData.roleId} not found for tier ${tier}`);
      return false;
    }
    await member.roles.add(role).catch(err => this.logger.error(`Failed to add role: ${err.message}`));
    return true;
  }

  async removeRole(member, tier) {
    const tierData = this.tiers[tier];
    if (!tierData) return;
    const role = member.guild.roles.cache.get(tierData.roleId);
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role).catch(err => this.logger.error(`Failed to remove role: ${err.message}`));
    }
  }

  // ---------- EXPIRY HANDLER ----------
  async checkExpiredSubscriptions() {
    const db = this.deps.db;
    const now = Date.now();
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT userId, guildId, tier FROM subscriptions WHERE expiresAt <= ?`, [now], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    for (const row of rows) {
      await this.expireSubscription(row.userId, row.guildId, row.tier);
    }
    this.logger.info(`Checked subscriptions: ${rows.length} expired`);
  }

  async expireSubscription(userId, guildId, tier) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await this.removeRole(member, tier);
      // Send DM notification
      const user = await this.client.users.fetch(userId).catch(() => null);
      if (user) {
        user.send(`⚠️ Your **${this.tiers[tier].name}** subscription has expired. Use \`/subscribe\` to renew.`).catch(() => {});
      }
    }
    await this.deleteSubscription(userId, guildId);
    this.eventBus.emit('vip.expired', { userId, guildId, tier });
    this.logger.info(`Expired ${tier} for user ${userId} in guild ${guildId}`);
  }

  // ---------- GRANT SUBSCRIPTION (from payment or admin) ----------
  async grantSubscription(userId, guildId, tier, durationDays = null, autoRenew = 0, paymentMethod = 'manual') {
    const tierData = this.tiers[tier];
    if (!tierData) throw new Error('Invalid tier');
    const duration = durationDays || tierData.durationDays;
    const expiresAt = Date.now() + duration * 24 * 60 * 60 * 1000;
    // Check existing subscription to avoid overwriting without removing old role
    const existing = await this.getSubscription(userId, guildId);
    if (existing) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await this.removeRole(member, existing.tier);
      }
    }
    await this.setSubscription(userId, guildId, tier, expiresAt, autoRenew);
    // Assign role
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await this.assignRole(member, tier);
    }
    await this.logPayment(userId, guildId, tier, tierData.price, paymentMethod);
    this.eventBus.emit('vip.granted', { userId, guildId, tier, expiresAt });
    this.logger.info(`Granted ${tier} to ${userId} until ${new Date(expiresAt).toISOString()}`);
    return expiresAt;
  }

  // ---------- RENEWAL (extend subscription) ----------
  async renewSubscription(userId, guildId, tier, additionalDays = null, paymentMethod = 'manual') {
    const existing = await this.getSubscription(userId, guildId);
    if (!existing) {
      // No active sub -> grant new
      return await this.grantSubscription(userId, guildId, tier, additionalDays, 0, paymentMethod);
    }
    const tierData = this.tiers[tier];
    const days = additionalDays || tierData.durationDays;
    let newExpiry = existing.expiresAt;
    if (newExpiry > Date.now()) {
      newExpiry += days * 24 * 60 * 60 * 1000;
    } else {
      newExpiry = Date.now() + days * 24 * 60 * 60 * 1000;
    }
    await this.setSubscription(userId, guildId, tier, newExpiry, existing.autoRenew);
    await this.logPayment(userId, guildId, tier, tierData.price, paymentMethod);
    this.eventBus.emit('vip.renewed', { userId, guildId, tier, newExpiry });
    return newExpiry;
  }

  // ---------- CANCEL SUBSCRIPTION (remove role but keep history) ----------
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
    // Payment webhook integration
    this.subscribe('payment.success', async (data) => {
      // data: { userId, guildId, tier, amount, currency, transactionId }
      const { userId, guildId, tier } = data;
      if (this.tiers[tier]) {
        await this.grantSubscription(userId, guildId, tier, null, 0, 'crypto');
      } else {
        this.logger.warn(`Unknown tier ${tier} in payment.success`);
      }
    });
    // Purchase from shop (economyAgent emits)
    this.subscribe('economy.rolePurchased', async (data) => {
      // data: { userId, guildId, roleId, itemId }
      // Map roleId to tier
      for (const [tierKey, tierVal] of Object.entries(this.tiers)) {
        if (tierVal.roleId === data.roleId) {
          await this.grantSubscription(data.userId, data.guildId, tierKey, null, 0, 'coins');
          break;
        }
      }
    });
    // Admin grant via command (emitted by adminAgent)
    this.subscribe('admin.vip.grant', async (data) => {
      await this.grantSubscription(data.userId, data.guildId, data.tier, data.durationDays, 0, 'admin');
    });
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, user, guild, options } = interaction;

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
        // Admin only (check permissions)
        if (!interaction.member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        await this.cmdGrantVip(interaction);
        break;
      case 'revokevip':
        if (!interaction.member.permissions.has('Administrator')) {
          return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        }
        await this.cmdRevokeVip(interaction);
        break;
    }
  }

  async cmdVipStatus(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = await this.getSubscription(userId, guildId);
    if (!sub) {
      return interaction.reply({ content: 'You do not have an active subscription.', ephemeral: true });
    }
    const tierData = this.tiers[sub.tier];
    const expiresDate = new Date(sub.expiresAt).toLocaleDateString();
    const embed = new EmbedBuilder()
      .setTitle(`✨ Your ${tierData.name} Subscription`)
      .addFields(
        { name: 'Tier', value: tierData.name, inline: true },
        { name: 'Expires', value: expiresDate, inline: true },
        { name: 'Auto-renew', value: sub.autoRenew ? 'Yes' : 'No', inline: true },
        { name: 'Perks', value: tierData.perks }
      )
      .setColor(0x9b59b6);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdSubscribe(interaction) {
    const tierOption = interaction.options.getString('tier');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    if (!this.tiers[tierOption]) {
      return interaction.reply({ content: `Invalid tier. Choose: ${Object.keys(this.tiers).join(', ')}`, ephemeral: true });
    }
    const tierData = this.tiers[tierOption];
    // You can integrate with economyAgent to deduct coins if using in‑game currency
    // For simplicity, we'll emit an event for payment creation
    this.eventBus.emit('vip.purchase.init', { userId, guildId, tier: tierOption, price: tierData.price });
    await interaction.reply({ content: `💰 Starting purchase of **${tierData.name}** for ${tierData.price} coins. Use /balance to check funds.`, ephemeral: true });
    // In a real integration, you'd open a modal or button to confirm purchase.
  }

  async cmdCancel(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = await this.getSubscription(userId, guildId);
    if (!sub) {
      return interaction.reply({ content: 'You have no active subscription to cancel.', ephemeral: true });
    }
    await this.cancelSubscription(userId, guildId);
    await interaction.reply({ content: `✅ Your ${this.tiers[sub.tier].name} subscription has been cancelled. You will lose access when it expires.`, ephemeral: true });
  }

  async cmdRenew(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const sub = await this.getSubscription(userId, guildId);
    if (!sub) {
      return interaction.reply({ content: 'You have no active subscription to renew.', ephemeral: true });
    }
    const tierData = this.tiers[sub.tier];
    // Emit event for payment (or trigger coin deduction)
    this.eventBus.emit('vip.renew.init', { userId, guildId, tier: sub.tier, price: tierData.price });
    await interaction.reply({ content: `🔄 Renewing your ${tierData.name} subscription for ${tierData.price} coins.`, ephemeral: true });
  }

  async cmdGrantVip(interaction) {
    const target = interaction.options.getUser('user');
    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('days') || 30;
    if (!this.tiers[tier]) {
      return interaction.reply({ content: 'Invalid tier.', ephemeral: true });
    }
    const guildId = interaction.guild.id;
    await this.grantSubscription(target.id, guildId, tier, days, 0, 'admin');
    await interaction.reply({ content: `✅ Granted **${this.tiers[tier].name}** to ${target.tag} for ${days} days.`, ephemeral: true });
  }

  async cmdRevokeVip(interaction) {
    const target = interaction.options.getUser('user');
    const guildId = interaction.guild.id;
    const sub = await this.getSubscription(target.id, guildId);
    if (!sub) {
      return interaction.reply({ content: `${target.tag} has no active subscription.`, ephemeral: true });
    }
    await this.cancelSubscription(target.id, guildId);
    await interaction.reply({ content: `🔰 Revoked ${this.tiers[sub.tier].name} from ${target.tag}.`, ephemeral: true });
  }
}

module.exports = VipAgent;