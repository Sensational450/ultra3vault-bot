/**
 * 💰 EconomyAgent v5.0
 * - Daily rewards, balance, shop, leaderboard, transfer, inventory
 * - Uses models layer (Economy) for all database operations
 * - No table creation (handled by migrations)
 * - Emits events for purchases and grants
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class EconomyAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.defaultConfig = {
      currencyName: 'Coins',
      currencySymbol: '💰',
      dailyRewardMin: 100,
      dailyRewardMax: 500,
      dailyCooldownHours: 24,
      startBalance: 0,
      shopMessage: 'Use `/shop` to view items!',
    };
    this.guildConfigs = new Map();
    this.dailyCooldowns = new Map(); // userId -> last claim timestamp
    // Shop items (could be moved to DB later)
    this.shopItems = [
      { id: 'role_vip', name: 'VIP Role', type: 'role', roleId: process.env.VIP_ROLE_ID, price: 5000, description: 'Access to VIP channels' },
      { id: 'item_lottery', name: 'Lottery Ticket', type: 'consumable', price: 100, description: 'Enter the weekly lottery' },
      { id: 'color_red', name: 'Red Name Color', type: 'role', roleId: process.env.COLOR_ROLE_ID, price: 2000, description: 'Custom role color' },
    ];
  }

  async init() {
    await super.init();
    this.logger.info('💰 EconomyAgent ready');
  }

  // ---------- BALANCE HELPERS (using models) ----------
  async getBalance(userId, guildId) {
    return await this.models.Economy.getBalance(userId, guildId);
  }

  async setBalance(userId, guildId, amount) {
    await this.models.Economy.setBalance(userId, guildId, amount);
  }

  async addBalance(userId, guildId, amount) {
    await this.models.Economy.addBalance(userId, guildId, amount);
  }

  async removeBalance(userId, guildId, amount) {
    await this.models.Economy.addBalance(userId, guildId, -amount);
  }

  // ---------- INVENTORY (simplified – can be extended) ----------
  async addInventory(userId, guildId, itemId, quantity = 1) {
    // For now, just store in a simple table via direct DB (or create Inventory model)
    // We'll keep direct db for inventory to avoid complexity; but we'll avoid table creation.
    const db = this.deps.db;
    await db.run(`INSERT INTO economy_inventory (userId, guildId, itemId, quantity)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(userId, guildId, itemId) DO UPDATE SET quantity = quantity + ?`,
                  [userId, guildId, itemId, quantity, quantity]);
  }

  async getInventory(userId, guildId) {
    const db = this.deps.db;
    return await db.all(`SELECT itemId, quantity FROM economy_inventory WHERE userId = ? AND guildId = ?`, [userId, guildId]);
  }

  // ---------- EVENT BUS ----------
  setupListeners() {
    this.subscribe('economy.purchase', async (data) => {
      await this.purchaseItem(data.userId, data.guildId, data.itemId, data.amount);
    });
    this.subscribe('economy.grant', async (data) => {
      await this.addBalance(data.userId, data.guildId, data.amount);
      this.logger.info(`Granted ${data.amount} to ${data.userId}`);
    });
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    switch (commandName) {
      case 'balance':
      case 'bal':
        await this.cmdBalance(interaction);
        break;
      case 'daily':
        await this.cmdDaily(interaction);
        break;
      case 'shop':
        await this.cmdShop(interaction);
        break;
      case 'buy':
        await this.cmdBuy(interaction);
        break;
      case 'leaderboard':
      case 'lb':
        await this.cmdLeaderboard(interaction);
        break;
      case 'transfer':
        await this.cmdTransfer(interaction);
        break;
      case 'inventory':
      case 'inv':
        await this.cmdInventory(interaction);
        break;
      case 'gamble':
      case 'flip':
        await this.cmdGamble(interaction);
        break;
    }
  }

  // ---------- COMMAND IMPLEMENTATIONS ----------
  async cmdDaily(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const config = await this.getGuildConfig(guildId);
    const now = Date.now();
    const lastDaily = this.dailyCooldowns.get(userId) || 0;
    const cooldownMs = config.dailyCooldownHours * 60 * 60 * 1000;

    if (now - lastDaily < cooldownMs) {
      const remaining = cooldownMs - (now - lastDaily);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({ content: `⏳ You already claimed your daily reward! Try again in ${hours}h ${minutes}m.`, ephemeral: true });
    }
    const reward = Math.floor(Math.random() * (config.dailyRewardMax - config.dailyRewardMin + 1) + config.dailyRewardMin);
    await this.addBalance(userId, guildId, reward);
    this.dailyCooldowns.set(userId, now);
    const embed = new EmbedBuilder()
      .setTitle('🎁 Daily Reward')
      .setDescription(`You received **${reward}** ${config.currencySymbol}!`)
      .setColor(0x00ff00);
    await interaction.reply({ embeds: [embed] });
    this.emit('economy.daily', { userId, guildId, amount: reward });
  }

  async cmdBalance(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const balance = await this.getBalance(target.id, interaction.guild.id);
    const config = await this.getGuildConfig(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle(`${target.displayName}'s Balance`)
      .setDescription(`${config.currencySymbol} ${balance} ${config.currencyName}`)
      .setColor(0x00ae86);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdShop(interaction) {
    const config = await this.getGuildConfig(interaction.guild.id);
    let description = '';
    for (const item of this.shopItems) {
      description += `**${item.name}** - ${config.currencySymbol} ${item.price}\n${item.description}\n\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('🛒 Shop')
      .setDescription(description || 'No items available.')
      .setFooter({ text: 'Use /buy <item_name> to purchase' })
      .setColor(0xffaa00);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdBuy(interaction) {
    const itemName = interaction.options.getString('item');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const item = this.shopItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    if (!item) return interaction.reply({ content: 'Item not found.', ephemeral: true });
    const balance = await this.getBalance(userId, guildId);
    if (balance < item.price) {
      return interaction.reply({ content: `Insufficient funds. Need ${item.price} coins.`, ephemeral: true });
    }
    await this.removeBalance(userId, guildId, item.price);
    if (item.type === 'role' && item.roleId) {
      const member = await interaction.guild.members.fetch(userId);
      await member.roles.add(item.roleId).catch(() => null);
      await interaction.reply({ content: `✅ Purchased **${item.name}**! Role assigned.`, ephemeral: true });
      this.emit('economy.rolePurchased', { userId, guildId, roleId: item.roleId, itemId: item.id });
    } else if (item.type === 'consumable') {
      await this.addInventory(userId, guildId, item.id);
      await interaction.reply({ content: `✅ Purchased **${item.name}**! Check /inventory.`, ephemeral: true });
    }
  }

  async cmdInventory(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const inventory = await this.getInventory(userId, guildId);
    if (inventory.length === 0) return interaction.reply({ content: 'Your inventory is empty.', ephemeral: true });
    let desc = '';
    for (const inv of inventory) {
      const item = this.shopItems.find(i => i.id === inv.itemId);
      desc += `${item?.name || inv.itemId} x${inv.quantity}\n`;
    }
    const embed = new EmbedBuilder().setTitle('📦 Inventory').setDescription(desc).setColor(0x88aaee);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdLeaderboard(interaction) {
    const guildId = interaction.guild.id;
    const leaderboard = await this.models.Economy.getLeaderboard(guildId, 10);
    if (leaderboard.length === 0) return interaction.reply('No economy data yet.');
    let description = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const user = await this.client.users.fetch(leaderboard[i].userId).catch(() => null);
      const name = user ? user.username : leaderboard[i].userId;
      description += `${i+1}. **${name}** – ${leaderboard[i].balance} coins\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Leaderboard').setDescription(description).setColor(0xffd700);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdTransfer(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const senderId = interaction.user.id;
    const guildId = interaction.guild.id;
    if (target.id === senderId) return interaction.reply({ content: 'You cannot transfer to yourself.', ephemeral: true });
    const senderBal = await this.getBalance(senderId, guildId);
    if (senderBal < amount) return interaction.reply({ content: 'Insufficient balance.', ephemeral: true });
    await this.removeBalance(senderId, guildId, amount);
    await this.addBalance(target.id, guildId, amount);
    await interaction.reply({ content: `✅ Transferred ${amount} coins to ${target.username}.`, ephemeral: true });
  }

  async cmdGamble(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const balance = await this.getBalance(userId, guildId);
    if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', ephemeral: true });
    if (balance < amount) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });
    const win = Math.random() < 0.5;
    if (win) {
      await this.addBalance(userId, guildId, amount);
      const newBal = await this.getBalance(userId, guildId);
      await interaction.reply(`🎉 You won **${amount}** coins! New balance: ${newBal}`);
    } else {
      await this.removeBalance(userId, guildId, amount);
      const newBal = await this.getBalance(userId, guildId);
      await interaction.reply(`💀 You lost **${amount}** coins. New balance: ${newBal}`);
    }
  }

  // ---------- GUILD CONFIG ----------
  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    this.guildConfigs.set(guildId, { ...this.defaultConfig });
    return this.guildConfigs.get(guildId);
  }
}

module.exports = EconomyAgent;