/**
 * 🔗 ReferralAgent v5.2 – Centralized Webhooks
 * - Referral code generation and redemption
 * - Tracks referrals, rewards referrer and referee (coins, VIP days)
 * - Leaderboard and stats
 * - Uses models.Referral layer (if available) with fallback to direct DB queries
 * - Guild config stored in referral_configs table (survives restarts)
 * - Sends referral leaderboard via "Architect" webhook (centralized)
 * - Falls back to ephemeral reply if webhook not configured or fails
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js'); // removed WebhookClient
const { sendWebhook } = require('../index'); // ✅ centralized helper

class ReferralAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.defaultConfig = {
      rewardReferrerCoins: 500,
      rewardRefereeCoins: 200,
      rewardReferrerVipDays: 0,
      rewardRefereeVipDays: 0,
      maxReferralsPerUser: 50,
      codeLength: 8,
      resetLeaderboardWeekly: false,
    };
    this.guildConfigs = new Map(); // cache (loaded from DB)
  }

  async init() {
    await super.init();
    // Ensure referral_configs table exists
    await this.ensureTable(`
      CREATE TABLE IF NOT EXISTS referral_configs (
        guildId TEXT PRIMARY KEY,
        config TEXT
      )
    `);
    await this.loadAllConfigs();
    this.subscribe('job.leaderboardReset', async () => {
      for (const [guildId, config] of this.guildConfigs.entries()) {
        if (config.resetLeaderboardWeekly) {
          await this.resetLeaderboard(guildId);
        }
      }
    });
    const hasWebhook = !!process.env.LEADERBOARD_WEBHOOK_URL;
    this.logger.info(`🔗 ReferralAgent v5.2 ready (leaderboard webhook: ${hasWebhook ? '✅' : '❌'})`);
  }

  // ---------- PERSISTENT CONFIG HELPERS ----------
  async loadAllConfigs() {
    try {
      const rows = await this.db.all(`SELECT guildId, config FROM referral_configs`);
      for (const row of rows) {
        this.guildConfigs.set(row.guildId, JSON.parse(row.config));
      }
    } catch (err) {
      this.logger.warn(`Could not load referral configs: ${err.message}`);
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    this.guildConfigs.set(guildId, config);
    await this.db.run(`INSERT OR REPLACE INTO referral_configs (guildId, config) VALUES (?, ?)`, [guildId, JSON.stringify(config)]);
    return config;
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    await this.db.run(`INSERT OR REPLACE INTO referral_configs (guildId, config) VALUES (?, ?)`, [guildId, JSON.stringify(config)]);
  }

  // ---------- CODE GENERATION ----------
  generateCode() {
    const crypto = require('crypto');
    const len = this.defaultConfig.codeLength;
    return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len).toUpperCase();
  }

  async createReferralCode(userId, guildId) {
    if (this.models?.Referral) {
      let code = await this.models.Referral.getCodeByUser(userId, guildId);
      if (!code) {
        code = this.generateCode();
        await this.models.Referral.setCode(userId, guildId, code);
      }
      return code;
    } else {
      let row = await this.db.get(`SELECT code FROM referral_codes WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      if (row) return row.code;
      const code = this.generateCode();
      await this.db.run(`INSERT INTO referral_codes (userId, guildId, code, createdAt) VALUES (?, ?, ?, ?)`,
        [userId, guildId, code, Date.now()]);
      return code;
    }
  }

  async getCodeByUser(userId, guildId) {
    if (this.models?.Referral) {
      return await this.models.Referral.getCodeByUser(userId, guildId);
    } else {
      const row = await this.db.get(`SELECT code FROM referral_codes WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      return row?.code || null;
    }
  }

  async getUserIdByCode(code, guildId) {
    if (this.models?.Referral) {
      return await this.models.Referral.getUserByCode(code, guildId);
    } else {
      const row = await this.db.get(`SELECT userId FROM referral_codes WHERE code = ? AND guildId = ?`, [code, guildId]);
      return row?.userId || null;
    }
  }

  // ---------- REWARD HANDLING ----------
  async processReferral(referrerId, refereeId, guildId) {
    if (referrerId === refereeId) return false;
    if (await this.hasReferral(refereeId, guildId)) return false;
    const config = await this.getGuildConfig(guildId);
    const referrerStats = await this.getReferralStats(referrerId, guildId);
    if (referrerStats.totalReferrals >= config.maxReferralsPerUser) return false;

    if (this.models?.Referral) {
      await this.models.Referral.recordReferral(referrerId, refereeId, guildId, config.rewardReferrerCoins);
    } else {
      await this.db.run(`INSERT INTO referrals (referrerId, refereeId, guildId, timestamp, rewardClaimed) VALUES (?, ?, ?, ?, ?)`,
        [referrerId, refereeId, guildId, Date.now(), 0]);
    }
    await this.updateStats(referrerId, guildId, 1, config.rewardReferrerCoins);
    await this.updateStats(refereeId, guildId, 0, config.rewardRefereeCoins);
    await this.grantRewards(referrerId, refereeId, guildId, config);
    if (!this.models?.Referral) {
      await this.db.run(`UPDATE referrals SET rewardClaimed = 1 WHERE referrerId = ? AND refereeId = ? AND guildId = ?`,
        [referrerId, refereeId, guildId]);
    }
    return true;
  }

  async grantRewards(referrerId, refereeId, guildId, config) {
    if (config.rewardReferrerCoins > 0) {
      this.emit('economy.grant', { userId: referrerId, guildId, amount: config.rewardReferrerCoins, reason: 'referral' });
    }
    if (config.rewardRefereeCoins > 0) {
      this.emit('economy.grant', { userId: refereeId, guildId, amount: config.rewardRefereeCoins, reason: 'referral_bonus' });
    }
    if (config.rewardReferrerVipDays > 0) {
      this.emit('admin.vip.grant', { userId: referrerId, guildId, tier: 'vip', durationDays: config.rewardReferrerVipDays, source: 'referral' });
    }
    if (config.rewardRefereeVipDays > 0) {
      this.emit('admin.vip.grant', { userId: refereeId, guildId, tier: 'vip', durationDays: config.rewardRefereeVipDays, source: 'referral' });
    }
    try {
      const referrerUser = await this.client.users.fetch(referrerId);
      const refereeUser = await this.client.users.fetch(refereeId);
      referrerUser.send(`🎉 You gained a new referral! +${config.rewardReferrerCoins} coins. Total referrals: ${(await this.getReferralStats(referrerId, guildId)).totalReferrals}`).catch(() => {});
      refereeUser.send(`🎁 Welcome! You received ${config.rewardRefereeCoins} bonus coins for using a referral code.`).catch(() => {});
    } catch (err) {}
    this.logger.info(`Referral: ${referrerId} referred ${refereeId} in guild ${guildId}`);
  }

  async hasReferral(userId, guildId) {
    if (this.models?.Referral) {
      return await this.models.Referral.isReferred(userId, guildId);
    } else {
      const row = await this.db.get(`SELECT id FROM referrals WHERE refereeId = ? AND guildId = ?`, [userId, guildId]);
      return !!row;
    }
  }

  async updateStats(userId, guildId, incReferrals, incCoins) {
    await this.db.run(`INSERT INTO referral_stats (userId, guildId, totalReferrals, totalRewardsCoins, lastReferralAt)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(userId, guildId) DO UPDATE SET
                    totalReferrals = totalReferrals + ?,
                    totalRewardsCoins = totalRewardsCoins + ?,
                    lastReferralAt = ?`,
                  [userId, guildId, incReferrals, incCoins, Date.now(), incReferrals, incCoins, Date.now()]);
  }

  async getReferralStats(userId, guildId) {
    if (this.models?.Referral) {
      return await this.models.Referral.getReferrerStats(userId, guildId);
    } else {
      const row = await this.db.get(`SELECT totalReferrals, totalRewardsCoins, lastReferralAt FROM referral_stats WHERE userId = ? AND guildId = ?`, [userId, guildId]);
      return row || { totalReferrals: 0, totalRewardsCoins: 0, lastReferralAt: 0 };
    }
  }

  async getReferralsList(referrerId, guildId, limit = 10) {
    if (this.models?.Referral) {
      return await this.models.Referral.getReferralsByReferrer(referrerId, guildId, limit);
    } else {
      return await this.db.all(`SELECT refereeId, timestamp FROM referrals WHERE referrerId = ? AND guildId = ? ORDER BY timestamp DESC LIMIT ?`,
        [referrerId, guildId, limit]);
    }
  }

  async getLeaderboard(guildId, limit = 10) {
    return await this.db.all(`SELECT userId, totalReferrals FROM referral_stats WHERE guildId = ? ORDER BY totalReferrals DESC LIMIT ?`,
      [guildId, limit]);
  }

  async resetLeaderboard(guildId) {
    await this.db.run(`DELETE FROM referral_stats WHERE guildId = ?`, [guildId]);
    await this.db.run(`DELETE FROM referrals WHERE guildId = ?`, [guildId]);
    this.logger.info(`Referral leaderboard reset for guild ${guildId}`);
  }

  // ---------- Helper: Send Leaderboard via Centralized Webhook or Fallback ----------
  async _sendLeaderboard(interaction, embed) {
    const hasWebhook = !!process.env.LEADERBOARD_WEBHOOK_URL;
    if (hasWebhook) {
      try {
        await sendWebhook('leaderboard', { embeds: [embed] }, { username: 'Architect' });
        await interaction.reply({ content: '📊 Referral leaderboard posted to the configured channel.', ephemeral: true });
        this.logger.debug('✅ Referral leaderboard sent via Architect webhook');
        return;
      } catch (err) {
        this.logger.warn(`Leaderboard webhook failed: ${err.message} – falling back to ephemeral reply`);
      }
    }

    // Fallback: ephemeral reply to the user
    await interaction.reply({ embeds: [embed], ephemeral: true });
    this.logger.debug('✅ Referral leaderboard sent as ephemeral reply');
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
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
    if (!code) code = await this.createReferralCode(userId, guildId);
    const stats = await this.getReferralStats(userId, guildId);
    const embed = new EmbedBuilder()
      .setTitle('🔗 Your Referral Link')
      .setDescription(`Share this code with friends: \`${code}\`\nThey can use \`/redeem ${code}\` to get rewards!`)
      .addFields(
        { name: 'Total Referrals', value: stats.totalReferrals.toString(), inline: true },
        { name: 'Total Rewards', value: stats.totalRewardsCoins.toString(), inline: true }
      )
      .setColor(0x00ae86);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdRedeem(interaction) {
    const code = interaction.options.getString('code');
    const refereeId = interaction.user.id;
    const guildId = interaction.guild.id;
    const referrerId = await this.getUserIdByCode(code, guildId);
    if (!referrerId) return interaction.reply({ content: '❌ Invalid referral code.', ephemeral: true });
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
    if (leaderboard.length === 0) {
      await interaction.reply({ content: 'No referrals yet.', ephemeral: true });
      return;
    }
    let desc = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const user = await this.client.users.fetch(leaderboard[i].userId).catch(() => null);
      desc += `${i+1}. **${user ? user.username : leaderboard[i].userId}** – ${leaderboard[i].totalReferrals} referrals\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('🏆 Referral Leaderboard')
      .setDescription(desc)
      .setColor(0xffd700)
      .setTimestamp();

    await this._sendLeaderboard(interaction, embed);
  }

  async cmdSetReferral(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const config = await this.getGuildConfig(guildId);
    if (sub === 'setreward') {
      const type = interaction.options.getString('type');
      const amount = interaction.options.getInteger('amount');
      if (type === 'referrer_coins') config.rewardReferrerCoins = amount;
      else if (type === 'referee_coins') config.rewardRefereeCoins = amount;
      else if (type === 'referrer_vip_days') config.rewardReferrerVipDays = amount;
      else if (type === 'referee_vip_days') config.rewardRefereeVipDays = amount;
      else return interaction.reply({ content: 'Invalid type', ephemeral: true });
      await this.updateGuildConfig(guildId, config);
      await interaction.reply({ content: `✅ Updated ${type} to ${amount}.`, ephemeral: true });
    } else if (sub === 'resetweekly') {
      const enable = interaction.options.getBoolean('enable');
      config.resetLeaderboardWeekly = enable;
      await this.updateGuildConfig(guildId, config);
      await interaction.reply({ content: `Weekly leaderboard reset ${enable ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = ReferralAgent;