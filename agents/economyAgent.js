/**
 * 💰 EconomyAgent v6.2 – Centralized Webhooks
 * - Daily rewards, balance, shop, leaderboard, transfer, inventory, gamble
 * - Streak system, XP, levels, daily missions, achievements, reputation
 * - Tiered XP multipliers (VIP=2x, Premium=3x)
 * - Auto-creates required tables
 * - Leaderboard posts via `sendWebhook('leaderboard', ...)` (Architect webhook)
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const { sendWebhook } = require('../core/webhook'); // ✅ centralized helper

class EconomyAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config ----
    this.defaultConfig = {
      currencyName: 'Coins',
      currencySymbol: '💰',
      dailyRewardMin: 100,
      dailyRewardMax: 500,
      dailyCooldownHours: 24,
      startBalance: 0,
    };
    this.guildConfigs = new Map();

    // ---- Shop Items ----
    this.shopItems = [
      { id: 'role_vip', name: 'VIP Role', type: 'role', roleId: process.env.VIP_ROLE_ID, price: 5000, description: 'Access to VIP channels' },
      { id: 'item_lottery', name: 'Lottery Ticket', type: 'consumable', price: 100, description: 'Enter the weekly lottery' },
      { id: 'color_red', name: 'Red Name Color', type: 'role', roleId: process.env.COLOR_ROLE_ID, price: 2000, description: 'Custom role color' },
    ];

    // ---- Missions (daily) ----
    this.missions = [
      { id: 'chat', name: 'Send 10 messages', requirement: 10, rewardXp: 50, rewardCoins: 100 },
      { id: 'daily', name: 'Claim /daily', requirement: 1, rewardXp: 30, rewardCoins: 50 },
      { id: 'gamble', name: 'Gamble 3 times', requirement: 3, rewardXp: 40, rewardCoins: 80 },
    ];

    // ---- Achievements ----
    this.achievements = [
      { id: 'first_message', name: 'First Message', description: 'Send your first message', check: (stats) => stats.messages >= 1 },
      { id: '100_messages', name: '100 Messages', description: 'Send 100 messages', check: (stats) => stats.messages >= 100 },
      { id: '7_day_streak', name: '7-Day Streak', description: 'Claim /daily for 7 days in a row', check: (stats) => stats.streak >= 7 },
      { id: 'first_referral', name: 'First Referral', description: 'Refer your first friend', check: (stats) => stats.referrals >= 1 },
      { id: 'vip_buyer', name: 'VIP Buyer', description: 'Purchase VIP role', check: (stats) => stats.boughtVip === true },
    ];

    // ---- Caches ----
    this.processedMessages = new Set();
    this.cacheTTL = 60000;
  }

  async init() {
    await super.init();
    await this._ensureTables();
    this.subscribe('job.dailyMissionReset', async () => {
      await this._resetMissions();
    });
    this.subscribe('referral.used', async (data) => {
      await this._handleReferral(data);
    });
    this.subscribe('vip.granted', async (data) => {
      if (data.tier === 'vip') await this._handleVipPurchase(data);
    });
    this.logger.info('💰 EconomyAgent v6.2 ready (Engagement Pack + centralized webhooks)');
  }

  // ---------- Leaderboard Webhook (centralized) ----------
  async _sendViaLeaderboardWebhook(embed) {
    try {
      await sendWebhook('leaderboard', { embeds: [embed] }, { username: 'Architect' });
      this.logger.debug('✅ Leaderboard sent via Architect webhook');
      return true;
    } catch (err) {
      this.logger.warn(`Leaderboard webhook failed: ${err.message}`);
      return false;
    }
  }

  // ---------- Table Creation ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_cooldowns (
        userId TEXT, guildId TEXT, command TEXT, lastUsed INTEGER,
        PRIMARY KEY (userId, guildId, command)
      );
      CREATE TABLE IF NOT EXISTS user_streaks (
        userId TEXT, guildId TEXT, streakCount INTEGER DEFAULT 0, lastClaimed INTEGER,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS user_xp (
        userId TEXT, guildId TEXT, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS user_missions (
        userId TEXT, guildId TEXT, missionId TEXT, progress INTEGER DEFAULT 0, completed INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId, missionId)
      );
      CREATE TABLE IF NOT EXISTS user_achievements (
        userId TEXT, guildId TEXT, achievementId TEXT, unlockedAt INTEGER,
        PRIMARY KEY (userId, guildId, achievementId)
      );
      CREATE TABLE IF NOT EXISTS user_reputation (
        userId TEXT, guildId TEXT, helpfulScore INTEGER DEFAULT 0, thankedBy TEXT,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS user_stats (
        userId TEXT, guildId TEXT, messages INTEGER DEFAULT 0, referrals INTEGER DEFAULT 0, boughtVip BOOLEAN DEFAULT 0,
        PRIMARY KEY (userId, guildId)
      );
    `);
  }

  // ---------- Mission Reset ----------
  async _resetMissions() {
    const db = this.deps.db;
    await db.run(`DELETE FROM user_missions`);
    this.logger.info('🔄 Daily missions reset');
  }

  // ---------- Message Tracking ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const key = `${message.author.id}_${message.guild.id}_${Date.now()}`;
    if (this.processedMessages.has(key)) return;
    this.processedMessages.add(key);
    setTimeout(() => this.processedMessages.delete(key), this.cacheTTL);

    // Update message count for achievements
    const db = this.deps.db;
    await db.run(
      `INSERT INTO user_stats (userId, guildId, messages, referrals, boughtVip)
       VALUES (?, ?, 1, 0, 0)
       ON CONFLICT(userId, guildId) DO UPDATE SET messages = messages + 1`,
      [message.author.id, message.guild.id]
    );

    // Give XP for messages (with tier bonuses)
    const xp = await this._calculateMessageXP(message.author.id, message.guild.id);
    await this._addXP(message.author.id, message.guild.id, xp, 'message');

    // Track mission progress for 'chat'
    await this._trackMissionProgress(message.author.id, message.guild.id, 'chat');
  }

  async _calculateMessageXP(userId, guildId) {
    let base = 5;
    const vipAgent = this.deps.orchestrator?.getAgent('VipAgent');
    if (vipAgent) {
      const sub = await vipAgent.getSubscription(userId, guildId);
      if (sub) {
        if (sub.tier === 'premium') base *= 3;
        else if (sub.tier === 'vip') base *= 2;
      }
    }
    return base;
  }

  // ---------- XP System ----------
  async _addXP(userId, guildId, amount, reason) {
    const db = this.deps.db;
    let row = await db.get(`SELECT xp, level FROM user_xp WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    if (!row) {
      row = { xp: 0, level: 1 };
    }
    const newXP = row.xp + amount;
    const newLevel = this._calculateLevel(newXP);
    await db.run(
      `INSERT OR REPLACE INTO user_xp (userId, guildId, xp, level) VALUES (?, ?, ?, ?)`,
      [userId, guildId, newXP, newLevel]
    );
    if (newLevel > row.level) {
      this.emit('xp.levelup', { userId, guildId, newLevel, oldLevel: row.level });
    }
    await this._checkAchievements(userId, guildId);
  }

  _calculateLevel(xp) {
    if (xp < 100) return 1;
    if (xp < 250) return 2;
    if (xp < 500) return 3;
    if (xp < 1000) return 4;
    if (xp < 2000) return 5;
    return 5 + Math.floor((xp - 2000) / 1000);
  }

  // ---------- Streak System ----------
  async _updateStreak(userId, guildId) {
    const db = this.deps.db;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let row = await db.get(`SELECT streakCount, lastClaimed FROM user_streaks WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    let streak = 0;
    if (row) {
      const diff = now - row.lastClaimed;
      if (diff < day) return row.streakCount;
      else if (diff < day * 2) streak = row.streakCount + 1;
      else streak = 1;
    } else {
      streak = 1;
    }
    await db.run(
      `INSERT OR REPLACE INTO user_streaks (userId, guildId, streakCount, lastClaimed) VALUES (?, ?, ?, ?)`,
      [userId, guildId, streak, now]
    );
    // Bonus for 7-day streak
    if (streak === 7) {
      const bonus = 200;
      await this.addBalance(userId, guildId, bonus);
      this.emit('economy.streakBonus', { userId, guildId, streak, bonus });
    }
    await this._checkAchievements(userId, guildId);
    return streak;
  }

  // ---------- Missions ----------
  async _trackMissionProgress(userId, guildId, missionId) {
    const db = this.deps.db;
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission) return;
    let row = await db.get(
      `SELECT progress, completed FROM user_missions WHERE userId = ? AND guildId = ? AND missionId = ?`,
      [userId, guildId, missionId]
    );
    let progress = row ? row.progress : 0;
    let completed = row ? row.completed : 0;
    if (completed) return;
    progress++;
    if (progress >= mission.requirement) {
      completed = 1;
      await this._grantMissionReward(userId, guildId, mission);
    }
    await db.run(
      `INSERT OR REPLACE INTO user_missions (userId, guildId, missionId, progress, completed) VALUES (?, ?, ?, ?, ?)`,
      [userId, guildId, missionId, progress, completed]
    );
  }

  async _grantMissionReward(userId, guildId, mission) {
    await this.addBalance(userId, guildId, mission.rewardCoins);
    await this._addXP(userId, guildId, mission.rewardXp, `mission_${mission.id}`);
    this.emit('economy.missionComplete', { userId, guildId, missionId: mission.id });
  }

  // ---------- Achievements ----------
  async _checkAchievements(userId, guildId) {
    const db = this.deps.db;
    // Gather stats
    const stats = {};
    const streakRow = await db.get(`SELECT streakCount FROM user_streaks WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    stats.streak = streakRow ? streakRow.streakCount : 0;
    const statRow = await db.get(`SELECT messages, referrals, boughtVip FROM user_stats WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    stats.messages = statRow ? statRow.messages : 0;
    stats.referrals = statRow ? statRow.referrals : 0;
    stats.boughtVip = statRow ? statRow.boughtVip : false;

    for (const ach of this.achievements) {
      if (ach.check(stats)) {
        const existing = await db.get(`SELECT * FROM user_achievements WHERE userId = ? AND guildId = ? AND achievementId = ?`, [userId, guildId, ach.id]);
        if (!existing) {
          await db.run(
            `INSERT INTO user_achievements (userId, guildId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)`,
            [userId, guildId, ach.id, Date.now()]
          );
          await this._addXP(userId, guildId, 50, `achievement_${ach.id}`);
          this.emit('achievement.unlocked', { userId, guildId, achievement: ach });
        }
      }
    }
  }

  // ---------- Reputation ----------
  async _addReputation(userId, guildId, amount, thankedBy) {
    const db = this.deps.db;
    let row = await db.get(`SELECT helpfulScore, thankedBy FROM user_reputation WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    let score = row ? row.helpfulScore : 0;
    let thanked = row ? JSON.parse(row.thankedBy || '[]') : [];
    score += amount;
    if (thankedBy && !thanked.includes(thankedBy)) {
      thanked.push(thankedBy);
    }
    await db.run(
      `INSERT OR REPLACE INTO user_reputation (userId, guildId, helpfulScore, thankedBy) VALUES (?, ?, ?, ?)`,
      [userId, guildId, score, JSON.stringify(thanked)]
    );
  }

  // ---------- Hooks for External Events ----------
  async _handleReferral(data) {
    const { referrerId, guildId } = data;
    // Update stats for referrer
    const db = this.deps.db;
    await db.run(
      `INSERT INTO user_stats (userId, guildId, messages, referrals, boughtVip)
       VALUES (?, ?, 0, 1, 0)
       ON CONFLICT(userId, guildId) DO UPDATE SET referrals = referrals + 1`,
      [referrerId, guildId]
    );
    await this._addXP(referrerId, guildId, 100, 'referral');
    await this._trackMissionProgress(referrerId, guildId, 'referral');
    await this._checkAchievements(referrerId, guildId);
  }

  async _handleVipPurchase(data) {
    const { userId, guildId } = data;
    const db = this.deps.db;
    await db.run(
      `INSERT INTO user_stats (userId, guildId, messages, referrals, boughtVip)
       VALUES (?, ?, 0, 0, 1)
       ON CONFLICT(userId, guildId) DO UPDATE SET boughtVip = 1`,
      [userId, guildId]
    );
    await this._checkAchievements(userId, guildId);
  }

  // ---------- Balance Helpers (unchanged) ----------
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

  async deductBalance(userId, guildId, amount, reason) {
    const currentBalance = await this.getBalance(userId, guildId);
    if (currentBalance < amount) return false;
    await this.removeBalance(userId, guildId, amount);
    this.emit('economy.balanceChanged', { userId, guildId, newBalance: currentBalance - amount, change: -amount, reason });
    return true;
  }

  // ---------- Inventory ----------
  async addInventory(userId, guildId, itemId, quantity = 1) {
    const db = this.deps.db;
    await db.run(
      `INSERT INTO economy_inventory (userId, guildId, itemId, quantity)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(userId, guildId, itemId) DO UPDATE SET quantity = quantity + ?`,
      [userId, guildId, itemId, quantity, quantity]
    );
  }

  async getInventory(userId, guildId) {
    const db = this.deps.db;
    return await db.all(`SELECT itemId, quantity FROM economy_inventory WHERE userId = ? AND guildId = ?`, [userId, guildId]);
  }

  // ---------- Slash Commands ----------
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
      case 'leaderboard':
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
      // ---- New engagement commands ----
      case 'streak':
        await this.cmdStreak(interaction);
        break;
      case 'missions':
        await this.cmdMissions(interaction);
        break;
      case 'achievements':
        await this.cmdAchievements(interaction);
        break;
      case 'reputation':
        await this.cmdReputation(interaction);
        break;
      case 'xp':
        await this.cmdXP(interaction);
        break;
      case 'thank':
        await this.cmdThank(interaction);
        break;
    }
  }

  // ---- Existing Commands (updated with engagement hooks) ----
  async cmdDaily(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const config = await this.getGuildConfig(guildId);
    const now = Date.now();
    const lastDaily = await this.getLastDaily(userId, guildId);
    const cooldownMs = config.dailyCooldownHours * 60 * 60 * 1000;

    if (now - lastDaily < cooldownMs) {
      const remaining = cooldownMs - (now - lastDaily);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({ content: `⏳ You already claimed your daily reward! Try again in ${hours}h ${minutes}m.`, ephemeral: true });
    }

    const baseReward = Math.floor(Math.random() * (config.dailyRewardMax - config.dailyRewardMin + 1) + config.dailyRewardMin);
    const streak = await this._updateStreak(userId, guildId);
    const bonus = Math.floor(streak / 7) * 50;
    const reward = baseReward + bonus;
    await this.addBalance(userId, guildId, reward);
    await this.setLastDaily(userId, guildId, now);
    await this._addXP(userId, guildId, 20, 'daily_claim');
    await this._trackMissionProgress(userId, guildId, 'daily');

    const embed = new EmbedBuilder()
      .setTitle('🎁 Daily Reward')
      .setDescription(`You received **${reward}** ${config.currencySymbol}! (Streak: ${streak} days)`)
      .setColor(0x00ff00);
    await interaction.reply({ embeds: [embed] });
    this.emit('economy.daily', { userId, guildId, amount: reward, streak });
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
    await this._addXP(senderId, guildId, 10, 'transfer');
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
    await this._trackMissionProgress(userId, guildId, 'gamble');
  }

  // ---- New Commands ----
  async cmdStreak(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    const row = await db.get(`SELECT streakCount FROM user_streaks WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    const streak = row ? row.streakCount : 0;
    const embed = new EmbedBuilder()
      .setTitle('🔥 Daily Streak')
      .setDescription(`You have **${streak}** consecutive days!`)
      .setColor(0xff7700)
      .setFooter({ text: 'Claim /daily to keep your streak alive!' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdMissions(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    let desc = '';
    for (const mission of this.missions) {
      const row = await db.get(
        `SELECT progress, completed FROM user_missions WHERE userId = ? AND guildId = ? AND missionId = ?`,
        [userId, guildId, mission.id]
      );
      const progress = row ? row.progress : 0;
      const completed = row ? row.completed : 0;
      const status = completed ? '✅' : '⏳';
      desc += `${status} **${mission.name}** — ${Math.min(progress, mission.requirement)}/${mission.requirement}\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('🎯 Daily Missions')
      .setDescription(desc)
      .setColor(0x00ff88);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdAchievements(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    const rows = await db.all(`SELECT achievementId FROM user_achievements WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    const unlocked = rows.map(r => r.achievementId);
    let desc = '';
    for (const ach of this.achievements) {
      const status = unlocked.includes(ach.id) ? '✅' : '🔒';
      desc += `${status} **${ach.name}** — ${ach.description}\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('🏅 Achievements')
      .setDescription(desc)
      .setColor(0xffd700);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdReputation(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const userId = target.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    const row = await db.get(`SELECT helpfulScore FROM user_reputation WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    const score = row ? row.helpfulScore : 0;
    const embed = new EmbedBuilder()
      .setTitle('🌟 Reputation')
      .setDescription(`${target.username} has a helpful score of **${score}**.`)
      .setColor(0x9b59b6);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdXP(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const userId = target.id;
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    const row = await db.get(`SELECT xp, level FROM user_xp WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    const xp = row ? row.xp : 0;
    const level = row ? row.level : 1;
    const embed = new EmbedBuilder()
      .setTitle('📊 Experience')
      .setDescription(`${target.username} — **Level ${level}** (${xp} XP)`)
      .setColor(0x3498db);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdThank(interaction) {
    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot thank yourself.', ephemeral: true });
    }
    await this._addReputation(target.id, interaction.guild.id, 1, interaction.user.id);
    await interaction.reply({ content: `✅ You thanked ${target.username} for their helpfulness!`, ephemeral: true });
  }

  // ---- Enhanced Leaderboard (coins and XP) ----
  async cmdLeaderboard(interaction) {
    const type = interaction.options.getString('type') || 'coins';
    const guildId = interaction.guild.id;
    const db = this.deps.db;
    let rows, title;
    if (type === 'xp') {
      rows = await db.all(`SELECT userId, xp, level FROM user_xp WHERE guildId = ? ORDER BY xp DESC LIMIT 10`, [guildId]);
      title = '🏆 XP Leaderboard';
    } else {
      rows = await this.models.Economy.getLeaderboard(guildId, 10);
      title = '🏆 Coin Leaderboard';
    }
    if (!rows || rows.length === 0) return interaction.reply('No data yet.');
    let desc = '';
    for (let i = 0; i < rows.length; i++) {
      const user = await this.client.users.fetch(rows[i].userId).catch(() => null);
      const name = user ? user.username : rows[i].userId;
      if (type === 'xp') {
        desc += `${i+1}. **${name}** — Level ${rows[i].level} (${rows[i].xp} XP)\n`;
      } else {
        desc += `${i+1}. **${name}** – ${rows[i].balance} coins\n`;
      }
    }
    const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed] });
  }

  // ---- Unchanged helpers (cooldowns, guild config) ----
  async getLastDaily(userId, guildId) {
    const db = this.deps.db;
    const row = await db.get(`SELECT lastUsed FROM user_cooldowns WHERE userId = ? AND guildId = ? AND command = 'daily'`, [userId, guildId]);
    return row ? row.lastUsed : 0;
  }

  async setLastDaily(userId, guildId, timestamp) {
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO user_cooldowns (userId, guildId, command, lastUsed) VALUES (?, ?, 'daily', ?)`,
      [userId, guildId, timestamp]
    );
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    this.guildConfigs.set(guildId, { ...this.defaultConfig });
    return this.guildConfigs.get(guildId);
  }

  // ---- Other existing commands (balance, shop, inventory) ----
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
      .setFooter({ text: 'Use `/buy` to purchase items (for economy items)' })
      .setColor(0xffaa00);
    await interaction.reply({ embeds: [embed] });
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
}

module.exports = EconomyAgent;