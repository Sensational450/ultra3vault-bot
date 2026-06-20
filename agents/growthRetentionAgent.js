/**
 * 📈 GrowthRetentionAgent v5.0
 * - Tracks user activity (messages)
 * - Rewards milestones (10, 50, 100, 500, 1000 messages)
 * - Posts weekly leaderboard of top chatters
 * - Nudges inactive users (7+ days) with a reward offer
 * - Generates weekly growth reports
 * - Fully automated – uses existing channels
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class GrowthRetentionAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.models = deps.models;
    
    // Hardcoded defaults
    this.minMessagesForMilestone = 10;
    this.milestones = [10, 50, 100, 500, 1000, 5000];
    this.dailyRewardAmount = 50;
    this.inactivityDays = 7;
    this.inactivityReward = 100;
    this.topChattersLimit = 10;
    
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

    this.logger.info('📈 GrowthRetentionAgent v5.0 ready');
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
      // Get or create user stats
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

    // Emit economy event (if economyAgent is listening)
    this.emit('economy.addBalance', { userId, guildId, amount, reason: `Milestone: ${count} messages` });

    this.logger.info(`🎉 Milestone: ${user.tag} reached ${count} messages (+${amount} tokens)`);
    
    // Optionally DM the user
    try {
      await user.send(`🎉 You reached **${count} messages**! You earned **${amount} tokens**! Keep it up!`);
    } catch {}
  }

  // ---------- DAILY RETENTION CHECK ----------
  async _dailyRetentionCheck() {
    const guilds = this.client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      try {
        // Top chatters today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const users = await this.models.User.findAll({
          where: { guildId },
          order: [['messageCount', 'DESC']],
          limit: this.topChattersLimit,
        });
        
        if (users.length === 0) return;

        // Random retention bonus (give 1 random active member a VIP trial)
        const randomIdx = Math.floor(Math.random() * Math.min(users.length, 5));
        const luckyUser = users[randomIdx];
        if (luckyUser) {
          // Emit VIP trial event (VipAgent listens to this)
          this.emit('vip.grantTrial', { 
            userId: luckyUser.userId, 
            guildId, 
            days: 3,
            reason: 'Daily retention bonus' 
          });
          const user = await this.client.users.fetch(luckyUser.userId).catch(() => null);
          if (user) {
            this.logger.info(`🎁 Retention bonus: ${user.tag} got 3-day VIP trial`);
            try {
              await user.send(`🎁 You've been randomly selected for a **3-day VIP trial**! Enjoy exclusive perks!`);
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
        
        // Check if they've already been nudged recently (optional: track lastNudge field)
        await user.send({
          content: `👋 Hey! We haven't seen you in **${this.inactivityDays} days**.\n` +
                   `We miss you! Come back and claim **${this.inactivityReward} tokens** as a welcome-back gift! 🎁\n` +
                   `Just send `/daily` to claim!`,
        });
        this.logger.info(`💤 Inactivity nudge sent to ${user.tag}`);
        
        // Update lastNudge to avoid spam (add a field in DB or just update lastActive)
        stats.lastActive = new Date(); // Reset so they don't get spammed
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
          limit: 5,
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
          .setFooter({ text: 'Ultra3Vault • Growth AI v5.0' });

        await channel.send({ embeds: [embed] });
        this.logger.info(`📊 Weekly growth report posted to #${channel.name}`);
      } catch (err) {
        this.logger.debug(`Weekly report failed for guild ${guildId}: ${err.message}`);
      }
    }
  }
}

module.exports = GrowthRetentionAgent;