/**
 * 📈 GrowthRetentionAgent v6.0 (Configurable)
 * - Tracks user activity (messages)
 * - Rewards milestones (configurable list)
 * - Posts weekly leaderboard of top chatters
 * - Nudges inactive users with configurable message
 * - Generates weekly growth reports
 * - Fully automated – uses existing channels
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class GrowthRetentionAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.models = deps.models;

    // ---- Config from Environment ----
    this.milestones = (process.env.GROWTH_MILESTONES || '10,50,100,500,1000,5000')
      .split(',').map(Number);
    this.dailyRewardAmount = parseInt(process.env.DAILY_RETENTION_REWARD) || 50;
    this.inactivityDays = parseInt(process.env.INACTIVITY_DAYS) || 7;
    this.inactivityReward = parseInt(process.env.INACTIVITY_REWARD) || 100;
    this.topChattersLimit = parseInt(process.env.TOP_CHATTERS_LIMIT) || 10;
    this.vipTrialDays = parseInt(process.env.RETENTION_VIP_TRIAL_DAYS) || 3;

    // ---- Nudge Message (configurable) ----
    this.inactivityNudgeMessage = process.env.INACTIVITY_NUDGE_MESSAGE ||
      "👋 Hey! We haven't seen you in **{days} days**.\n" +
      "We miss you! Come back and claim **{reward} tokens** as a welcome-back gift! 🎁\n" +
      "Just send `/daily` to claim!";

    // Cache to avoid duplicate processing per message
    this.processedMessages = new Set();
    this.cacheTTL = 60000; // 1 minute
  }

  async init() {
    await super.init();

    this.subscribe('job.dailyRetention', async () => {
      await this._dailyRetentionCheck();
    });

    this.subscribe('job.weeklyGrowthReport', async () => {
      await this._generateWeeklyReport();
    });

    this.subscribe('job.inactivityCheck', async () => {
      await this._nudgeInactiveUsers();
    });

    this.logger.info(`📈 GrowthRetentionAgent v6.0 ready (milestones: ${this.milestones.join(', ')})`);
  }

  // ---------- MESSAGE TRACKING ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const key = `${message.author.id}_${message.guild.id}_${Date.now()}`;
    if (this.processedMessages.has(key)) return;
    this.processedMessages.add(key);
    setTimeout(() => this.processedMessages.delete(key), this.cacheTTL);

    await this._trackActivity(message.author.id, message.guild.id);
  }

  async _trackActivity(userId, guildId) {
    try {
      let stats = await this.models.User.findOne({ where: { userId, guildId } });
      if (!stats) {
        stats = await this.models.User.create({
          userId,
          guildId,
          messageCount: 0,
          lastActive: new Date(),
          joinedAt: new Date(),
          milestoneLevel: 0,
        });
      } else {
        stats.messageCount += 1;
        stats.lastActive = new Date();
        await stats.save();
      }

      // Check milestones
      const level = this._getMilestoneLevel(stats.messageCount);
      if (level > stats.milestoneLevel) {
        await this._rewardMilestone(userId, guildId, stats.messageCount);
        stats.milestoneLevel = level;
        await stats.save();
      }
    } catch (err) {
      this.logger.debug(`Activity tracking failed: ${err.message}`);
    }
  }

  _getMilestoneLevel(count) {
    let level = 0;
    for (const m of this.milestones) {
      if (count >= m) level++;
    }
    return level;
  }

  async _rewardMilestone(userId, guildId, count) {
    const amount = Math.floor(count / 10) * 10; // 10 tokens per 10 messages
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (!user) return;

    this.emit('economy.addBalance', { userId, guildId, amount, reason: `Milestone: ${count} messages` });

    this.logger.info(`🎉 Milestone: ${user.tag} reached ${count} messages (+${amount} tokens)`);

    try {
      await user.send(`🎉 You reached **${count} messages**! You earned **${amount} tokens**! Keep it up!`);
    } catch {}
  }

  // ---------- DAILY RETENTION CHECK ----------
  async _dailyRetentionCheck() {
    const guilds = this.client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      try {
        const users = await this.models.User.findAll({
          where: { guildId },
          order: [['messageCount', 'DESC']],
          limit: this.topChattersLimit,
        });

        if (users.length === 0) return;

        const randomIdx = Math.floor(Math.random() * Math.min(users.length, 5));
        const luckyUser = users[randomIdx];
        if (luckyUser) {
          this.emit('vip.grantTrial', {
            userId: luckyUser.userId,
            guildId,
            days: this.vipTrialDays,
            reason: 'Daily retention bonus'
          });
          const user = await this.client.users.fetch(luckyUser.userId).catch(() => null);
          if (user) {
            this.logger.info(`🎁 Retention bonus: ${user.tag} got ${this.vipTrialDays}-day VIP trial`);
            try {
              await user.send(`🎁 You've been randomly selected for a **${this.vipTrialDays}-day VIP trial**! Enjoy exclusive perks!`);
            } catch {}
          }
        }
      } catch (err) {
        this.logger.debug(`Daily retention failed for guild ${guildId}: ${err.message}`);
      }
    }
  }

  // ---------- INACTIVITY NUDGE ----------
  async _nudgeInactiveUsers() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.inactivityDays);

    const inactiveUsers = await this.models.User.findAll({
      where: {
        lastActive: { [this.models.Sequelize.Op.lt]: cutoff },
      },
    });

    for (const stats of inactiveUsers) {
      try {
        const user = await this.client.users.fetch(stats.userId).catch(() => null);
        if (!user) continue;

        const message = this.inactivityNudgeMessage
          .replace(/{days}/g, this.inactivityDays)
          .replace(/{reward}/g, this.inactivityReward);

        await user.send(message);
        this.logger.info(`💤 Inactivity nudge sent to ${user.tag}`);

        // Reset lastActive to avoid repeated nudges
        stats.lastActive = new Date();
        await stats.save();
      } catch (err) {
        this.logger.debug(`Inactivity nudge failed for ${stats.userId}: ${err.message}`);
      }
    }
  }

  // ---------- WEEKLY GROWTH REPORT ----------
  async _generateWeeklyReport() {
    const guilds = this.client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      try {
        const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
        if (!channelId) continue;
        const channel = this.client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const totalMembers = guild.memberCount;
        const newMembers = guild.members.cache.filter(m => m.joinedAt > weekAgo).size;

        const topUsers = await this.models.User.findAll({
          where: { guildId },
          order: [['messageCount', 'DESC']],
          limit: this.topChattersLimit,
        });

        let topList = '';
        for (let i = 0; i < topUsers.length; i++) {
          const user = await this.client.users.fetch(topUsers[i].userId).catch(() => null);
          if (user) {
            topList += `**${i + 1}.** ${user.tag} — ${topUsers[i].messageCount} messages\n`;
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('📊 Weekly Growth Report')
          .setColor(0x00ff88)
          .setDescription(`📅 **${new Date().toLocaleDateString()}**`)
          .addFields(
            { name: '👥 Total Members', value: totalMembers.toString(), inline: true },
            { name: '🚀 New Members (7d)', value: newMembers.toString(), inline: true },
            { name: '📈 Top Chatters', value: topList || 'No data yet.', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Ultra3Vault • Growth AI v6.0' });

        await channel.send({ embeds: [embed] });
        this.logger.info(`📊 Weekly growth report posted to #${channel.name}`);
      } catch (err) {
        this.logger.debug(`Weekly report failed for guild ${guildId}: ${err.message}`);
      }
    }
  }
}

module.exports = GrowthRetentionAgent;