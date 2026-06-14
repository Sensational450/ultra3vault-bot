/**
 * 🛡️ ModerationAgent v5.0 (Persistent + auto‑subscription)
 * - Auto‑mod (scam, profanity, links, spam)
 * - Warning system with persistent storage (models.Warning)
 * - Guild configuration stored in DB (survives restarts)
 * - Mute, kick, ban, purge commands
 * - Raid detection (in‑memory only)
 * - Log channel support
 * - Auto‑sets mod log channel from DEFAULT_MOD_LOG_CHANNEL_ID on startup
 */
const BaseAgent = require('./baseAgent');
const { PermissionsBitField, EmbedBuilder } = require('discord.js');

class ModerationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.spamTracker = new Map();      // temporary: reset on restart (acceptable)
    this.raidTracker = new Map();      // temporary
    this.defaultConfig = {
      modLogChannel: null,
      modRoleId: null,
      adminRoleId: null,
      maxWarnings: 3,
      muteDurationMs: 60 * 1000,
      spamThreshold: 5,
      spamWindowMs: 5000,
      raidThreshold: 10,
      raidWindowMs: 10000,
      autoModEnabled: true,
      blockScam: true,
      blockProfanity: true,
      blockLinks: false,
      allowedDomains: [],
      profanityList: ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigga', 'retard'],
    };
  }

  async init() {
    await super.init();
    // Ensure guild configs table exists (should be created by migration 004)
    await this.ensureTable(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT,
        configKey TEXT,
        config TEXT,
        PRIMARY KEY (guildId, configKey)
      )
    `);
    await this.ensureDefaultModLogChannel(); // 👈 auto‑subscribe mod log channel
    this.logger.info('🛡️ ModerationAgent ready');
  }

  /**
   * Auto‑set mod log channel from DEFAULT_MOD_LOG_CHANNEL_ID if not already configured.
   */
  async ensureDefaultModLogChannel() {
    const defaultChannelId = process.env.DEFAULT_MOD_LOG_CHANNEL_ID;
    if (!defaultChannelId) {
      this.logger.debug('No DEFAULT_MOD_LOG_CHANNEL_ID set – skipping auto‑subscription');
      return;
    }
    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    const config = await this.getGuildConfig(guild.id);
    if (config.modLogChannel) {
      this.logger.debug(`Mod log channel already set to ${config.modLogChannel}`);
      return;
    }
    const channel = this.client.channels.cache.get(defaultChannelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Default mod log channel ${defaultChannelId} not found or not text‑based`);
      return;
    }
    await this.updateGuildConfig(guild.id, { modLogChannel: defaultChannelId });
    this.logger.info(`✅ Auto-set mod log channel to ${channel.name} (${defaultChannelId})`);
  }

  // ---------- EVENT BUS ----------
  setupListeners() {
    this.subscribe('moderation.warn', async (data) => {
      await this.addWarning(data.guildId, data.userId, data.reason, data.modId);
    });
    this.subscribe('guild.join', async (data) => {
      await this.handleJoinForRaid(data.guildId);
    });
  }

  // ---------- PERSISTENT GUILD CONFIG (using guild_configs table) ----------
  async getGuildConfig(guildId) {
    const row = await this.db.get(
      `SELECT config FROM guild_configs WHERE guildId = ? AND configKey = 'moderation'`,
      [guildId]
    );
    if (row) return JSON.parse(row.config);
    // Save default and return
    const defaultConfig = { ...this.defaultConfig };
    await this.db.run(
      `INSERT INTO guild_configs (guildId, configKey, config) VALUES (?, 'moderation', ?)`,
      [guildId, JSON.stringify(defaultConfig)]
    );
    return defaultConfig;
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, 'moderation', ?)`,
      [guildId, JSON.stringify(config)]
    );
  }

  // ---------- AUTO-MOD ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    const config = await this.getGuildConfig(message.guild.id);
    if (!config.autoModEnabled) return;

    let action = null;
    const content = message.content;

    if (config.blockScam && this.isScam(content)) action = 'scam';
    else if (config.blockProfanity && this.hasProfanity(content, config.profanityList)) action = 'profanity';
    else if (config.blockLinks && this.hasLink(content) && !this.isAllowedDomain(content, config.allowedDomains)) action = 'unauthorized link';
    else if (this.isSpam(message.author.id, config)) action = 'spam';

    if (action) await this.autoModAction(message, action);
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
      case 'warn': if (!isMod) return this.denyPerm(interaction); await this.cmdWarn(interaction); break;
      case 'warnings': if (!isMod) return this.denyPerm(interaction); await this.cmdWarnings(interaction); break;
      case 'clearwarns': if (!isMod) return this.denyPerm(interaction); await this.cmdClearWarns(interaction); break;
      case 'mute': if (!isMod) return this.denyPerm(interaction); await this.cmdMute(interaction); break;
      case 'kick': if (!isMod) return this.denyPerm(interaction); await this.cmdKick(interaction); break;
      case 'ban': if (!isAdmin) return this.denyPerm(interaction); await this.cmdBan(interaction); break;
      case 'purge': if (!isMod) return this.denyPerm(interaction); await this.cmdPurge(interaction); break;
      case 'setmodlog': if (!isAdmin) return this.denyPerm(interaction); await this.cmdSetModLog(interaction); break;
    }
  }

  async onGuildMemberAdd(member) {
    await this.handleJoinForRaid(member.guild.id);
  }

  // ---------- DETECTION HELPERS (unchanged) ----------
  isScam(content) {
    const patterns = [/discord\.gift/i, /steamcommunity\.com\/gift/i, /free\s+nitro/i, /free\s+boost/i, /(?:giveaway|gift)\s+.*\s+click\s+here/i];
    return patterns.some(p => p.test(content));
  }

  hasProfanity(content, list) {
    const lower = content.toLowerCase();
    return list.some(word => lower.includes(word));
  }

  hasLink(content) {
    return /https?:\/\/[^\s]+/i.test(content);
  }

  isAllowedDomain(content, allowedDomains) {
    if (!allowedDomains.length) return false;
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

  // ---------- PERSISTENT WARNING SYSTEM (using models) ----------
  async addWarning(guildId, userId, reason, modId) {
    if (!this.models?.Warning) {
      this.logger.error('Warning model not available – cannot persist warnings');
      return;
    }
    await this.models.Warning.add(userId, guildId, reason, modId);
    const warningCount = await this.models.Warning.getCount(userId, guildId);
    const config = await this.getGuildConfig(guildId);
    if (warningCount >= config.maxWarnings) {
      await this.applyMute(guildId, userId, config.muteDurationMs, `Reached ${config.maxWarnings} warnings`);
    }
    this.logger.info(`⚠️ Warning added to ${userId} in ${guildId}: ${reason}`);
  }

  async getWarnings(userId, guildId) {
    if (!this.models?.Warning) return [];
    return await this.models.Warning.get(userId, guildId);
  }

  async clearWarnings(userId, guildId) {
    if (!this.models?.Warning) return;
    await this.models.Warning.clear(userId, guildId);
  }

  async applyMute(guildId, userId, durationMs, reason) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.moderatable) {
      await member.timeout(durationMs, reason);
      const embed = new EmbedBuilder().setTitle('🔇 Muted').setColor(0xffaa00)
        .addFields({ name: 'User', value: member.user.tag }, { name: 'Reason', value: reason }).setTimestamp();
      await this.logToModChannel(guildId, { embeds: [embed] });
    }
  }

  // ---------- AUTO-MOD ACTION ----------
  async autoModAction(message, reason) {
    try {
      await message.delete();
      await message.author.send(`⚠️ Your message was removed for: ${reason}`).catch(() => {});
      const logEmbed = new EmbedBuilder()
        .setTitle('🛡️ Auto-Mod Action')
        .setColor(0xff0000)
        .addFields(
          { name: 'User', value: message.author.tag, inline: true },
          { name: 'Reason', value: reason, inline: true },
          { name: 'Channel', value: message.channel.name, inline: true }
        )
        .setTimestamp();
      await this.logToModChannel(message.guild.id, { embeds: [logEmbed] });
      await this.addWarning(message.guild.id, message.author.id, `Auto-mod: ${reason}`, 'AutoMod');
    } catch (err) {
      this.logger.error(`Auto-mod action failed: ${err.message}`);
    }
  }

  // ---------- RAID DETECTION (in‑memory) ----------
  async handleJoinForRaid(guildId) {
    const now = Date.now();
    if (!this.raidTracker.has(guildId)) this.raidTracker.set(guildId, { joinTimes: [], active: false });
    const data = this.raidTracker.get(guildId);
    data.joinTimes.push(now);
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
  }

  // ---------- COMMAND HANDLERS ----------
  async cmdWarn(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.reply({ content: 'Please specify a user.', ephemeral: true });
    await this.addWarning(interaction.guild.id, target.id, reason, interaction.user.id);
    await interaction.reply({ content: `⚠️ Warned ${target.tag}. Reason: ${reason}`, ephemeral: true });
  }

  async cmdWarnings(interaction) {
    const target = interaction.options.getUser('target');
    const warnings = await this.getWarnings(target.id, interaction.guild.id);
    if (warnings.length === 0) return interaction.reply({ content: `${target.tag} has no warnings.`, ephemeral: true });
    const description = warnings.map((w, i) => `${i+1}. ${w.reason} — by <@${w.modId}> (${new Date(w.timestamp).toLocaleString()})`).join('\n');
    const embed = new EmbedBuilder().setTitle(`⚠️ Warnings for ${target.tag}`).setDescription(description).setColor(0xffa500);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdClearWarns(interaction) {
    const target = interaction.options.getUser('target');
    await this.clearWarnings(target.id, interaction.guild.id);
    await interaction.reply({ content: `Cleared all warnings for ${target.tag}.`, ephemeral: true });
  }

  async cmdMute(interaction) {
    const target = interaction.options.getUser('target');
    const minutes = interaction.options.getInteger('minutes') || 5;
    const reason = interaction.options.getString('reason') || 'No reason';
    const member = await interaction.guild.members.fetch(target.id);
    if (!member.moderatable) return interaction.reply({ content: 'I cannot mute that user.', ephemeral: true });
    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply({ content: `🔇 Muted ${target.tag} for ${minutes} minutes.`, ephemeral: true });
  }

  async cmdKick(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason';
    const member = await interaction.guild.members.fetch(target.id);
    if (!member.kickable) return interaction.reply({ content: 'I cannot kick that user.', ephemeral: true });
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
    await interaction.reply({ content: `📝 Mod log set to ${channel}.`, ephemeral: true });
  }

  // ---------- LOG HELPER ----------
  async logToModChannel(guildId, payload) {
    const config = await this.getGuildConfig(guildId);
    const channelId = config.modLogChannel;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (channel?.isTextBased()) await channel.send(payload).catch(err => this.logger.error(`Failed to log: ${err.message}`));
  }

  denyPerm(interaction) {
    interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }
}

module.exports = ModerationAgent;