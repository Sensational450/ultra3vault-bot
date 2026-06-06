const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class ReferralAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.defaultConfig = {
      rewardReferrerCoins: 500,
      rewardRefereeCoins: 200,
      rewardReferrerVipDays: 0,      // optional: grant VIP days to referrer
      rewardRefereeVipDays: 0,       // optional: grant VIP days to new user
      maxReferralsPerUser: 50,       // soft limit
      codeLength: 8,
      resetLeaderboardWeekly: false,
    };
    this.guildConfigs = new Map();
  }

  async init() {
    await super.init();
    await this.initDatabase();
    // Load all configs from DB
    await this.loadAllConfigs();
    // Schedule weekly leaderboard reset if configured
    this.subscribe('job.leaderboardReset', async () => {
      for (const [guildId, config] of this.guildConfigs.entries()) {
        if (config.resetLeaderboardWeekly) {
          await this.resetLeaderboard(guildId);
        }
      }
    });
    this.logger.info('ReferralAgent ready');
  }

  async initDatabase() {
    const db = this.deps.db;
    // Referral codes table
    db.run(`CREATE TABLE IF NOT EXISTS referral_codes (
      userId TEXT,
      guildId TEXT,
      code TEXT UNIQUE,
      createdAt INTEGER,
      PRIMARY KEY (userId, guildId)
    )`);
    // Referral records
    db.run(`CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrerId TEXT,
      refereeId TEXT,
      guildId TEXT,
      timestamp INTEGER,
      rewardClaimed INTEGER DEFAULT 0  -- 0 = pending, 1 = claimed
    )`);
    // Referral stats per user
    db.run(`CREATE TABLE IF NOT EXISTS referral_stats (
      userId TEXT,
      guildId TEXT,
      totalReferrals INTEGER DEFAULT 0,
      totalRewardsCoins INTEGER DEFAULT 0,
      lastReferralAt INTEGER,
      PRIMARY KEY (userId, guildId)
    )`);
    // Guild configs
    db.run(`CREATE TABLE IF NOT EXISTS referral_configs (
      guildId TEXT PRIMARY KEY,
      config TEXT  -- JSON
    )`);
  }

  async loadAllConfigs() {
    const db = this.deps.db;
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT guildId, config FROM referral_configs`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    for (const row of rows) {
      this.guildConfigs.set(row.guildId, JSON.parse(row.config));
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    this.guildConfigs.set(guildId, config);
    // Save to DB
    const db = this.deps.db;
    db.run(`INSERT OR REPLACE INTO referral_configs (guildId, config) VALUES (?, ?)`, [guildId, JSON.stringify(config)]);
    return config;
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    const db = this.deps.db;
    db.run(`INSERT OR REPLACE INTO referral_configs (guildId, config) VALUES (?, ?)`, [guildId, JSON.stringify(config)]);
  }

  // ---------- CODE GENERATION ----------
  generateCode(userId, guildId) {
    const crypto = require('crypto');
    const base = crypto.randomBytes(Math.ceil(this.defaultConfig.codeLength / 2)).toString('hex').slice(0, this.defaultConfig.codeLength);
    return `${base}`.toUpperCase();
  }

  async createReferralCode(userId, guildId) {
    const db = this.deps.db;
    // Check if user already has a code
    const existing = await new Promise((resolve) => {
      db.get(`SELECT code FROM referral_codes WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
        if (err) resolve(null);
        else resolve(row);
      });
    });
    if (existing) return existing.code;
    const code = this.generateCode(userId, guildId);
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO referral_codes (userId, guildId, code, createdAt) VALUES (?, ?, ?, ?)`, [userId, guildId, code, Date.now()], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return code;
  }

  async getCodeByUser(userId, guildId) {
    const db = this.deps.db;
    const row = await new Promise((resolve) => {
      db.get(`SELECT code FROM referral_codes WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => resolve(row));
    });
    return row ? row.code : null;
  }

  async getUserIdByCode(code, guildId) {
    const db = this.deps.db;
    const row = await new Promise((resolve) => {
      db.get(`SELECT userId FROM referral_codes WHERE code = ? AND guildId = ?`, [code, guildId], (err, row) => resolve(row));
    });
    return row ? row.userId : null;
  }

  // ---------- REWARD HANDLING ----------
  async processReferral(referrerId, refereeId, guildId) {
    // Prevent self-referral
    if (referrerId === refereeId) return false;
    // Check if referee already used a code
    const alreadyReferred = await this.hasReferral(refereeId, guildId);
    if (alreadyReferred) return false;
    const config = await this.getGuildConfig(guildId);
    // Check referrer limit
    const referrerStats = await this.getReferralStats(referrerId, guildId);
    if (referrerStats.totalReferrals >= config.maxReferralsPerUser) return false;
    // Record referral
    const db = this.deps.db;
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO referrals (referrerId, refereeId, guildId, timestamp, rewardClaimed) VALUES (?, ?, ?, ?, ?)`,
        [referrerId, refereeId, guildId, Date.now(), 0], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });
    // Update stats
    await this.updateStats(referrerId, guildId, 1, config.rewardReferrerCoins);
    await this.updateStats(refereeId, guildId, 0, config.rewardRefereeCoins);
    // Grant rewards
    await this.grantRewards(referrerId, refereeId, guildId, config);
    // Mark as claimed
    await new Promise((resolve) => {
      db.run(`UPDATE referrals SET rewardClaimed = 1 WHERE referrerId = ? AND refereeId = ? AND guildId = ?`, [referrerId, refereeId, guildId]);
      resolve();
    });
    return true;
  }

  async grantRewards(referrerId, refereeId, guildId, config) {
    // Grant coins to referrer
    if (config.rewardReferrerCoins > 0) {
      this.eventBus.emit('economy.grant', { userId: referrerId, guildId, amount: config.rewardReferrerCoins, reason: 'referral' });
    }
    // Grant coins to referee
    if (config.rewardRefereeCoins > 0) {
      this.eventBus.emit('economy.grant', { userId: refereeId, guildId, amount: config.rewardRefereeCoins, reason: 'referral_bonus' });
    }
    // Grant VIP days to referrer
    if (config.rewardReferrerVipDays > 0) {
      this.eventBus.emit('admin.vip.grant', { userId: referrerId, guildId, tier: 'vip', durationDays: config.rewardReferrerVipDays, source: 'referral' });
    }
    // Grant VIP days to referee
    if (config.rewardRefereeVipDays > 0) {
      this.eventBus.emit('admin.vip.grant', { userId: refereeId, guildId, tier: 'vip', durationDays: config.rewardRefereeVipDays, source: 'referral' });
    }
    // Send DMs
    const client = this.deps.client;
    try {
      const referrerUser = await client.users.fetch(referrerId);
      const refereeUser = await client.users.fetch(refereeId);
      referrerUser.send(`🎉 You gained a new referral! +${config.rewardReferrerCoins} coins. Total referrals: ${(await this.getReferralStats(referrerId, guildId)).totalReferrals}`).catch(() => {});
      refereeUser.send(`🎁 Welcome! You received ${config.rewardRefereeCoins} bonus coins for using a referral code.`).catch(() => {});
    } catch (err) {}
    this.logger.info(`Referral: ${referrerId} referred ${refereeId} in guild ${guildId}`);
  }

  async hasReferral(userId, guildId) {
    const db = this.deps.db;
    const row = await new Promise((resolve) => {
      db.get(`SELECT id FROM referrals WHERE refereeId = ? AND guildId = ?`, [userId, guildId], (err, row) => resolve(row));
    });
    return !!row;
  }

  async updateStats(userId, guildId, incReferrals, incCoins) {
    const db = this.deps.db;
    await new Promise((resolve) => {
      db.run(`INSERT INTO referral_stats (userId, guildId, totalReferrals, totalRewardsCoins, lastReferralAt)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(userId, guildId) DO UPDATE SET
                totalReferrals = totalReferrals + ?,
                totalRewardsCoins = totalRewardsCoins + ?,
                lastReferralAt = ?`,
              [userId, guildId, incReferrals, incCoins, Date.now(), incReferrals, incCoins, Date.now()], (err) => resolve());
    });
  }

  async getReferralStats(userId, guildId) {
    const db = this.deps.db;
    const row = await new Promise((resolve) => {
      db.get(`SELECT totalReferrals, totalRewardsCoins, lastReferralAt FROM referral_stats WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => resolve(row));
    });
    return row || { totalReferrals: 0, totalRewardsCoins: 0, lastReferralAt: 0 };
  }

  async getReferralsList(referrerId, guildId, limit = 10) {
    const db = this.deps.db;
    const rows = await new Promise((resolve) => {
      db.all(`SELECT refereeId, timestamp FROM referrals WHERE referrerId = ? AND guildId = ? ORDER BY timestamp DESC LIMIT ?`, [referrerId, guildId, limit], (err, rows) => resolve(rows));
    });
    return rows;
  }

  async getLeaderboard(guildId, limit = 10) {
    const db = this.deps.db;
    const rows = await new Promise((resolve) => {
      db.all(`SELECT userId, totalReferrals FROM referral_stats WHERE guildId = ? ORDER BY totalReferrals DESC LIMIT ?`, [guildId, limit], (err, rows) => resolve(rows));
    });
    return rows;
  }

  async resetLeaderboard(guildId) {
    const db = this.deps.db;
    await new Promise((resolve) => {
      db.run(`DELETE FROM referral_stats WHERE guildId = ?`, [guildId], (err) => resolve());
    });
    await new Promise((resolve) => {
      db.run(`DELETE FROM referrals WHERE guildId = ?`, [guildId], (err) => resolve());
    });
    // Keep codes but reset stats
    this.logger.info(`Referral leaderboard reset for guild ${guildId}`);
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, options, user, guild } = interaction;

    switch (commandName) {
      case 'refer':
        await this.cmdRefer(interaction);
        break;
      case 'redeem':
        await this.cmdRedeem(interaction);
        break;
      case 'referrals':
        await this.cmdReferrals(interaction);
        break;
      case 'referralleaderboard':
        await this.cmdLeaderboard(interaction);
        break;
      case 'setreferral':
        if (!interaction.member.permissions.has('Administrator')) return this.deny(interaction);
        await this.cmdSetReferral(interaction);
        break;
    }
  }

  async cmdRefer(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    let code = await this.getCodeByUser(userId, guildId);
    if (!code) {
      code = await this.createReferralCode(userId, guildId);
    }
    const embed = new EmbedBuilder()
      .setTitle('🔗 Your Referral Link')
      .setDescription(`Share this code with friends: \`${code}\`\nThey can use \`/redeem ${code}\` to get rewards!`)
      .addFields(
        { name: 'Total Referrals', value: (await this.getReferralStats(userId, guildId)).totalReferrals.toString(), inline: true },
        { name: 'Total Rewards', value: (await this.getReferralStats(userId, guildId)).totalRewardsCoins.toString(), inline: true }
      )
      .setColor(0x00ae86);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdRedeem(interaction) {
    const code = interaction.options.getString('code');
    const refereeId = interaction.user.id;
    const guildId = interaction.guild.id;
    const referrerId = await this.getUserIdByCode(code, guildId);
    if (!referrerId) {
      return interaction.reply({ content: '❌ Invalid referral code.', ephemeral: true });
    }
    const success = await this.processReferral(referrerId, refereeId, guildId);
    if (success) {
      await interaction.reply({ content: '✅ Referral code redeemed! You received a bonus. 🎉', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Could not redeem code. You may have already used one, or the code is invalid.', ephemeral: true });
    }
  }

  async cmdReferrals(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const stats = await this.getReferralStats(userId, guildId);
    const referrals = await this.getReferralsList(userId, guildId, 10);
    let desc = `Total referrals: ${stats.totalReferrals}\nTotal coins earned: ${stats.totalRewardsCoins}\n\n**Recent referrals:**\n`;
    if (referrals.length === 0) desc += 'None yet.';
    for (const ref of referrals) {
      const user = await this.client.users.fetch(ref.refereeId).catch(() => null);
      desc += `• ${user ? user.username : ref.refereeId} - <t:${Math.floor(ref.timestamp/1000)}:R>\n`;
    }
    const embed = new EmbedBuilder().setTitle('📊 Your Referrals').setDescription(desc).setColor(0x3498db);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdLeaderboard(interaction) {
    const guildId = interaction.guild.id;
    const leaderboard = await this.getLeaderboard(guildId, 10);
    if (leaderboard.length === 0) return interaction.reply('No referrals yet.');
    let desc = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const user = await this.client.users.fetch(leaderboard[i].userId).catch(() => null);
      desc += `${i+1}. **${user ? user.username : leaderboard[i].userId}** – ${leaderboard[i].totalReferrals} referrals\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Referral Leaderboard').setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed] });
  }

  async cmdSetReferral(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const config = await this.getGuildConfig(guildId);
    switch (subcommand) {
      case 'setreward':
        const type = interaction.options.getString('type');
        const amount = interaction.options.getInteger('amount');
        if (type === 'referrer_coins') config.rewardReferrerCoins = amount;
        else if (type === 'referee_coins') config.rewardRefereeCoins = amount;
        else if (type === 'referrer_vip_days') config.rewardReferrerVipDays = amount;
        else if (type === 'referee_vip_days') config.rewardRefereeVipDays = amount;
        else return interaction.reply({ content: 'Invalid type', ephemeral: true });
        await this.updateGuildConfig(guildId, config);
        await interaction.reply({ content: `Updated ${type} to ${amount}.`, ephemeral: true });
        break;
      case 'resetweekly':
        const enable = interaction.options.getBoolean('enable');
        config.resetLeaderboardWeekly = enable;
        await this.updateGuildConfig(guildId, config);
        await interaction.reply({ content: `Weekly leaderboard reset ${enable ? 'enabled' : 'disabled'}.`, ephemeral: true });
        break;
    }
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = ReferralAgent;