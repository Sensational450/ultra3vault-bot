const BaseAgent = require('./baseAgent');
const { PermissionsBitField, EmbedBuilder } = require('discord.js');

class ModerationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    // Per-guild configuration cache
    this.guildConfigs = new Map();
    // warnings: Map<guildId, Map<userId, Array<{reason, modId, timestamp}>>>
    this.warnings = new Map();
    // spam tracker: Map<userId, {count, firstMsgTime}>
    this.spamTracker = new Map();
    // raid tracker: Map<guildId, {joinTimes: number[], active: boolean}>
    this.raidTracker = new Map();
    // default settings
    this.defaultConfig = {
      modLogChannel: null,
      modRoleId: null,
      adminRoleId: null,
      maxWarnings: 3,
      muteDurationMs: 60 * 1000, // 1 minute
      spamThreshold: 5,          // messages per 5 seconds
      spamWindowMs: 5000,
      raidThreshold: 10,         // joins per 10 seconds
      raidWindowMs: 10000,
      autoModEnabled: true,
      blockScam: true,
      blockProfanity: true,
      blockLinks: false,         // optional
      allowedDomains: [],
      profanityList: ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigga', 'retard'],
    };
  }

  async init() {
    await super.init();
    // Load configurations from database (optional, skip for now)
    this.logger.info('ModerationAgent ready');
  }

  // ---------- EVENT BUS SUBSCRIPTIONS ----------
  setupListeners() {
    this.subscribe('moderation.warn', async (data) => {
      await this.addWarning(data.guildId, data.userId, data.reason, data.modId);
    });
    this.subscribe('guild.join', async (data) => {
      await this.handleJoinForRaid(data.guildId);
    });
  }

  // ---------- MESSAGE AUTO-MOD ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const config = await this.getGuildConfig(message.guild.id);
    if (!config.autoModEnabled) return;

    let action = null;
    const content = message.content;

    // 1. Scam detection
    if (config.blockScam && this.isScam(content)) {
      action = 'scam';
    }
    // 2. Profanity
    else if (config.blockProfanity && this.hasProfanity(content, config.profanityList)) {
      action = 'profanity';
    }
    // 3. Link blocking (if enabled)
    else if (config.blockLinks && this.hasLink(content) && !this.isAllowedDomain(content, config.allowedDomains)) {
      action = 'unauthorized link';
    }
    // 4. Spam detection
    else if (this.isSpam(message.author.id, config)) {
      action = 'spam';
    }

    if (action) {
      await this.autoModAction(message, action);
    }
  }

  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, member, guild } = interaction;
    const config = await this.getGuildConfig(guild.id);

    const isMod = member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
                  (config.modRoleId && member.roles.cache.has(config.modRoleId));
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    (config.adminRoleId && member.roles.cache.has(config.adminRoleId));

    switch (commandName) {
      case 'warn':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdWarn(interaction);
        break;
      case 'warnings':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdWarnings(interaction);
        break;
      case 'clearwarns':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdClearWarns(interaction);
        break;
      case 'mute':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdMute(interaction);
        break;
      case 'kick':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdKick(interaction);
        break;
      case 'ban':
        if (!isAdmin) return this.denyPerm(interaction);
        await this.cmdBan(interaction);
        break;
      case 'purge':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdPurge(interaction);
        break;
      case 'setmodlog':
        if (!isAdmin) return this.denyPerm(interaction);
        await this.cmdSetModLog(interaction);
        break;
    }
  }

  async onGuildMemberAdd(member) {
    await this.handleJoinForRaid(member.guild.id);
  }

  // ---------- CORE FUNCTIONS ----------
  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    // Load from DB later – for now use default
    this.guildConfigs.set(guildId, { ...this.defaultConfig });
    return this.guildConfigs.get(guildId);
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    // Optionally persist to DB
  }

  isScam(content) {
    const scamPatterns = [
      /discord\.gift/i,
      /steamcommunity\.com\/gift/i,
      /free\s+nitro/i,
      /free\s+boost/i,
      /(?:giveaway|gift)\s+.*\s+click\s+here/i,
    ];
    return scamPatterns.some(p => p.test(content));
  }

  hasProfanity(content, list) {
    const lower = content.toLowerCase();
    return list.some(word => lower.includes(word));
  }

  hasLink(content) {
    return /https?:\/\/[^\s]+/i.test(content);
  }

  isAllowedDomain(content, allowedDomains) {
    if (allowedDomains.length === 0) return false; // block all links
    const match = content.match(/https?:\/\/([^\s/]+)/i);
    if (!match) return true;
    const domain = match[1].toLowerCase();
    return allowedDomains.some(d => domain === d || domain.endsWith(`.${d}`));
  }

  isSpam(userId, config) {
    const now = Date.now();
    const record = this.spamTracker.get(userId);
    if (!record) {
      this.spamTracker.set(userId, { count: 1, firstMsg: now });
      return false;
    }
    if (now - record.firstMsg > config.spamWindowMs) {
      record.count = 1;
      record.firstMsg = now;
      return false;
    }
    record.count++;
    return record.count > config.spamThreshold;
  }

  async autoModAction(message, reason) {
    try {
      await message.delete();
      // Send warning to user via DM or channel (optional)
      await message.author.send(`⚠️ Your message was removed for: ${reason}`).catch(() => {});
      // Log to mod log
      const logEmbed = new EmbedBuilder()
        .setTitle('Auto-Mod Action')
        .setColor(0xff0000)
        .addFields(
          { name: 'User', value: message.author.tag, inline: true },
          { name: 'Reason', value: reason, inline: true },
          { name: 'Channel', value: message.channel.name }
        )
        .setTimestamp();
      await this.logToModChannel(message.guild.id, { embeds: [logEmbed] });
      // Add a warning
      await this.addWarning(message.guild.id, message.author.id, `Auto-mod: ${reason}`, 'AutoMod');
    } catch (err) {
      this.logger.error(`Auto-mod action failed: ${err.message}`);
    }
  }

  // ---------- WARNING SYSTEM ----------
  async addWarning(guildId, userId, reason, modId) {
    if (!this.warnings.has(guildId)) this.warnings.set(guildId, new Map());
    const guildWarnings = this.warnings.get(guildId);
    if (!guildWarnings.has(userId)) guildWarnings.set(userId, []);
    const userWarnings = guildWarnings.get(userId);
    userWarnings.push({ reason, modId, timestamp: Date.now() });
    const config = await this.getGuildConfig(guildId);
    if (userWarnings.length >= config.maxWarnings) {
      await this.applyMute(guildId, userId, config.muteDurationMs, `Reached ${config.maxWarnings} warnings`);
    }
    this.logger.info(`Warning added to ${userId} in ${guildId}: ${reason}`);
  }

  async applyMute(guildId, userId, durationMs, reason) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && member.moderatable) {
      await member.timeout(durationMs, reason);
      const embed = new EmbedBuilder()
        .setTitle('Muted')
        .setColor(0xffaa00)
        .addFields({ name: 'User', value: member.user.tag }, { name: 'Reason', value: reason })
        .setTimestamp();
      await this.logToModChannel(guildId, { embeds: [embed] });
    }
  }

  // ---------- RAID DETECTION ----------
  async handleJoinForRaid(guildId) {
    const now = Date.now();
    if (!this.raidTracker.has(guildId)) {
      this.raidTracker.set(guildId, { joinTimes: [], active: false });
    }
    const data = this.raidTracker.get(guildId);
    data.joinTimes.push(now);
    // remove joins older than raidWindowMs
    const config = await this.getGuildConfig(guildId);
    const cutoff = now - config.raidWindowMs;
    data.joinTimes = data.joinTimes.filter(t => t > cutoff);
    if (data.joinTimes.length >= config.raidThreshold && !data.active) {
      data.active = true;
      await this.activateRaidMode(guildId);
    }
  }

  async activateRaidMode(guildId) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 RAID MODE ACTIVATED')
      .setDescription('High join activity detected. Automatic moderation measures enabled.')
      .setColor(0xff0000);
    await this.logToModChannel(guildId, { embeds: [embed] });
    // You can add auto lockdown logic here
  }

  // ---------- COMMAND IMPLEMENTATIONS ----------
  async cmdWarn(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.reply({ content: 'Please specify a user.', ephemeral: true });
    await this.addWarning(interaction.guild.id, target.id, reason, interaction.user.id);
    await interaction.reply({ content: `⚠️ Warned ${target.tag}. Reason: ${reason}`, ephemeral: true });
  }

  async cmdWarnings(interaction) {
    const target = interaction.options.getUser('target');
    const userWarnings = this.warnings.get(interaction.guild.id)?.get(target.id) || [];
    if (userWarnings.length === 0) {
      return interaction.reply({ content: `${target.tag} has no warnings.`, ephemeral: true });
    }
    const description = userWarnings.map((w, i) => 
      `${i+1}. ${w.reason} — by <@${w.modId}> (${new Date(w.timestamp).toLocaleString()})`
    ).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${target.tag}`)
      .setDescription(description)
      .setColor(0xffa500);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdClearWarns(interaction) {
    const target = interaction.options.getUser('target');
    this.warnings.get(interaction.guild.id)?.delete(target.id);
    await interaction.reply({ content: `Cleared all warnings for ${target.tag}.`, ephemeral: true });
  }

  async cmdMute(interaction) {
    const target = interaction.options.getUser('target');
    const minutes = interaction.options.getInteger('minutes') || 5;
    const reason = interaction.options.getString('reason') || 'No reason';
    const member = await interaction.guild.members.fetch(target.id);
    if (!member.moderatable) {
      return interaction.reply({ content: 'I cannot mute that user.', ephemeral: true });
    }
    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply({ content: `🔇 Muted ${target.tag} for ${minutes} minutes.`, ephemeral: true });
  }

  async cmdKick(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason';
    const member = await interaction.guild.members.fetch(target.id);
    if (!member.kickable) {
      return interaction.reply({ content: 'I cannot kick that user.', ephemeral: true });
    }
    await member.kick(reason);
    await interaction.reply({ content: `👢 Kicked ${target.tag}.`, ephemeral: true });
  }

  async cmdBan(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason';
    await interaction.guild.members.ban(target.id, { reason });
    await interaction.reply({ content: `🔨 Banned ${target.tag}.`, ephemeral: true });
  }

  async cmdPurge(interaction) {
    const amount = interaction.options.getInteger('amount') || 10;
    if (amount > 100) return interaction.reply({ content: 'Max 100 messages.', ephemeral: true });
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
  }

  async cmdSetModLog(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply({ content: 'Must be a text channel.', ephemeral: true });
    await this.updateGuildConfig(interaction.guild.id, { modLogChannel: channel.id });
    await interaction.reply({ content: `Mod log set to ${channel}.`, ephemeral: true });
  }

  // ---------- HELPERS ----------
  async logToModChannel(guildId, payload) {
    const config = await this.getGuildConfig(guildId);
    const channelId = config.modLogChannel;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(payload).catch(err => this.logger.error(`Failed to log: ${err.message}`));
    }
  }

  denyPerm(interaction) {
    interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }
}

module.exports = ModerationAgent;