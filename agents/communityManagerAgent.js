/**
 * 👥 CommunityManagerAgent v7.2 (Centralized Webhooks)
 * - Sends scheduled welcome messages to new members
 * - Auto‑assigns a default role on join
 * - Posts automated announcements (token launches, NFT drops, AMAs) via "Herald" webhook
 * - Uses sendWebhook('announcements', payload) for webhook delivery
 * - Falls back to channel.send if webhook URL is not configured
 * - Fully automated – no manual commands needed
 * - Configurable messages via environment variables
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const { sendWebhook } = require('../index'); // ✅ centralized webhook sender

class CommunityManagerAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config from Env ----
    this.welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    this.welcomeMessage = process.env.WELCOME_MESSAGE || 
      'Welcome to the community, {user}! 🚀\nCheck out <#announcements> for updates and use `/help` to get started.';

    this.autoRoleId = process.env.AUTO_ROLE_ID;
    this.announcementChannelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
    this.giveawayRoleId = process.env.GIVEAWAY_ROLE_ID;

    // ---- Web3 specific configs (optional) ----
    this.tokenLaunches = JSON.parse(process.env.TOKEN_LAUNCHES || '[]');
    this.nftGiveaways = JSON.parse(process.env.NFT_GIVEAWAYS || '[]');
    this.amaSchedule = process.env.AMA_SCHEDULE || '0 18 * * 5'; // Every Friday at 6 PM UTC

    // ---- DM welcome message (configurable) ----
    this.dmWelcomeMessage = process.env.DM_WELCOME_MESSAGE ||
      'Welcome to the server! Check out the channels and feel free to introduce yourself.';

    // ---- AMA reminder texts (configurable) ----
    this.amaReminderTitle = process.env.AMA_REMINDER_TITLE || '🎙️ AMA Session Starting Now!';
    this.amaReminderDescription = process.env.AMA_REMINDER_DESCRIPTION ||
      'Join us for our weekly Ask Me Anything session with our core team.';
    this.amaReminderLocation = process.env.AMA_REMINDER_LOCATION || '<#voice-channel> or <#ama-chat>';
    this.amaReminderWhen = process.env.AMA_REMINDER_WHEN || 'Right now!';

    // ---- Engagement tracking ----
    this.activeUsers = new Map();
    this.lastActivity = new Map();
    this.engagementThreshold = parseInt(process.env.ENGAGEMENT_THRESHOLD) || 5;
  }

  async init() {
    await super.init();

    this.subscribe('job.announcementCheck', async () => {
      await this.postScheduledAnnouncements();
    });

    this.subscribe('job.engagementCheck', async () => {
      await this.rewardActiveMembers();
    });

    this.logger.info('👥 CommunityManagerAgent v7.2 ready (Herald webhook)');
  }

  // ---------- Helper: Send via Webhook (centralized) or Channel ----------
  async _sendAnnouncement(embed) {
    if (!this.announcementChannelId) {
      this.logger.warn('⚠️ Announcement channel ID not set – skipping');
      return;
    }

    // 1. Try webhook if configured
    if (process.env.ANNOUNCEMENTS_WEBHOOK_URL) {
      try {
        await sendWebhook('announcements', { embeds: [embed] }, { username: 'Herald' });
        this.logger.debug('✅ Announcement sent via Herald webhook');
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to channel.send`);
      }
    }

    // 2. Fallback to regular channel.send
    const channel = this.client.channels.cache.get(this.announcementChannelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Announcement channel ${this.announcementChannelId} not found or not text-based`);
      return;
    }
    await channel.send({ embeds: [embed] });
    this.logger.debug('✅ Announcement sent via channel.send');
  }

  // ---------- Event Handlers ----------
  async onGuildMemberAdd(member) {
    // 1. Welcome message in channel (regular send – interactive)
    if (this.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(this.welcomeChannelId);
      if (channel?.isTextBased()) {
        const message = this.welcomeMessage.replace(/{user}/g, member.toString());
        await channel.send(message).catch(err => this.logger.error(`Welcome send failed: ${err.message}`));
      }
    }

    // 2. Auto‑assign role
    if (this.autoRoleId) {
      try {
        const role = member.guild.roles.cache.get(this.autoRoleId);
        if (role) await member.roles.add(role);
      } catch (err) {
        this.logger.error(`Auto‑role assignment failed: ${err.message}`);
      }
    }

    // 3. DM welcome (regular DM)
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🌐 Welcome!')
        .setDescription(this.dmWelcomeMessage)
        .setColor(0x9b59b6)
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] });
    } catch {}

    this.logger.info(`👋 ${member.user.tag} joined ${member.guild.name}`);
  }

  // ---------- Automated Announcements ----------
  async postScheduledAnnouncements() {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // 1. Token launches (from env)
    for (const launch of this.tokenLaunches) {
      if (launch.date === today) {
        const embed = new EmbedBuilder()
          .setTitle(`🚀 Token Launch: ${launch.name}`)
          .setDescription(launch.description || 'A new token is launching!')
          .setColor(0x00ff88)
          .addFields(
            { name: '📅 Date', value: launch.date, inline: true },
            { name: '🔗 Network', value: launch.network || 'Ethereum', inline: true },
            { name: '📋 Details', value: launch.details || 'Check our website for more info.', inline: false }
          )
          .setTimestamp();
        await this._sendAnnouncement(embed);
        this.logger.info(`🚀 Posted token launch: ${launch.name}`);
      }
    }

    // 2. NFT giveaways (from env)
    for (const giveaway of this.nftGiveaways) {
      if (giveaway.date === today) {
        const embed = new EmbedBuilder()
          .setTitle(`🎁 NFT Giveaway: ${giveaway.name}`)
          .setDescription(giveaway.description || 'Win an exclusive NFT!')
          .setColor(0xff7700)
          .addFields(
            { name: '📅 Ends', value: giveaway.endDate || 'Soon!', inline: true },
            { name: '🎯 How to Enter', value: giveaway.entryMethod || 'React below to enter!', inline: false }
          )
          .setTimestamp();
        await this._sendAnnouncement(embed);
        this.logger.info(`🎁 Posted NFT giveaway: ${giveaway.name}`);
      }
    }

    // 3. AMA reminder (configurable via env)
    if (this._matchCron(this.amaSchedule, now)) {
      const embed = new EmbedBuilder()
        .setTitle(this.amaReminderTitle)
        .setDescription(this.amaReminderDescription)
        .setColor(0x3498db)
        .addFields(
          { name: '📍 Where', value: this.amaReminderLocation, inline: true },
          { name: '⏰ When', value: this.amaReminderWhen, inline: true }
        )
        .setTimestamp();
      await this._sendAnnouncement(embed);
      this.logger.info('🎙️ AMA reminder posted');
    }
  }

  // ---------- Engagement Rewards ----------
  async rewardActiveMembers() {
    this.logger.debug('📊 Engagement check running...');
    // Implement database integration here if needed
  }

  // ---------- Slash Commands ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'announce':
        await this.cmdAnnounce(interaction);
        break;
      case 'setwelcome':
        await this.cmdSetWelcome(interaction);
        break;
      case 'communitystats':
        await this.cmdCommunityStats(interaction);
        break;
    }
  }

  async cmdAnnounce(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`)
      .setDescription(description)
      .setColor(0x00ff88)
      .setTimestamp()
      .setFooter({ text: `Posted by ${interaction.user.tag}` });

    // If the target channel is the announcement channel and webhook is configured, use it
    if (channel.id === this.announcementChannelId && process.env.ANNOUNCEMENTS_WEBHOOK_URL) {
      try {
        await sendWebhook('announcements', { embeds: [embed] }, { username: 'Herald' });
        await interaction.reply({ content: '✅ Announcement posted via Herald webhook.', ephemeral: true });
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed for manual announce: ${err.message} – falling back`);
      }
    }

    // Fallback: regular channel.send
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Announcement posted.', ephemeral: true });
  }

  async cmdSetWelcome(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');

    if (channel) this.welcomeChannelId = channel.id;
    if (message) this.welcomeMessage = message;

    await interaction.reply({
      content: `✅ Welcome channel set to ${channel ? channel.toString() : 'unchanged'} and message updated.`,
      ephemeral: true
    });
  }

  async cmdCommunityStats(interaction) {
    const memberCount = interaction.guild.memberCount;
    const onlineCount = interaction.guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
    const botCount = interaction.guild.members.cache.filter(m => m.user.bot).size;

    const embed = new EmbedBuilder()
      .setTitle('📊 Community Stats')
      .setColor(0x3498db)
      .addFields(
        { name: '👥 Total Members', value: memberCount.toString(), inline: true },
        { name: '🟢 Online Now', value: onlineCount.toString(), inline: true },
        { name: '🤖 Bots', value: botCount.toString(), inline: true },
        { name: '🚀 Focus', value: 'Crypto • Web3 • DeFi', inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // ---------- Helper ----------
  _matchCron(cronExpression, date) {
    const parts = cronExpression.split(' ');
    if (parts.length < 2) return false;
    const [minute, hour] = parts;
    return parseInt(minute) === date.getMinutes() && parseInt(hour) === date.getHours();
  }
}

module.exports = CommunityManagerAgent;