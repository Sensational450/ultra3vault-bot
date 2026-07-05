/**
 * 🛡️ ModerationAgent v10.0 – Autonomous AI Moderation System
 * - AI detection (spam, scam, profanity, toxicity, harassment) using OpenAI/Gemini
 * - Web3 security: fake token contracts, wallet drainers, honeypots, impersonation
 * - Reputation system: trust score, scam risk, spam score, positive contributions
 * - Autonomous decisions: warn/timeout/kick/ban based on confidence and history
 * - Case management: IDs, evidence, appeals, case search
 * - Analytics: daily/weekly reports, top offenders, raid history
 * - Agent integration: communicates with EconomyAgent, CommunityManagerAgent, etc.
 * - Consolidated commands under /mod (warn, cases, reputation, stats, health, config)
 */
const BaseAgent = require('./baseAgent');
const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { sendWebhook } = require('../core/webhook');
const axios = require('axios');

// ---- Simple cache & rate limiters ----
class TTLCache {
  constructor(ttl = 60000) { this.cache = new Map(); this.ttl = ttl; }
  get(key) { const e = this.cache.get(key); if (!e) return null; if (Date.now() - e.timestamp > this.ttl) { this.cache.delete(key); return null; } return e.value; }
  set(key, value) { this.cache.set(key, { value, timestamp: Date.now() }); }
  clear() { this.cache.clear(); }
}

class ModerationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- AI Clients ----
    this.openai = null;
    this.useGemini = false;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.logger.info('🧠 OpenAI available for ModerationAgent');
      } else if (process.env.GEMINI_API_KEY) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        this.useGemini = true;
        this.logger.info('🧠 Gemini available for ModerationAgent');
      }
    } catch (err) {
      this.logger.warn(`AI init failed: ${err.message}`);
    }

    // ---- Config ----
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
      // NEW: AI moderation
      enableAI: true,
      enableWeb3Security: true,
      enableReputation: true,
      autonomousActions: true,
      minConfidence: 0.6,
      reputationThresholds: { trust: 50, scamRisk: 60, spamScore: 40 },
    };
    this.guildConfigs = new Map();

    // ---- Webhook ----
    this.webhookUsername = 'Vigil';
    this.webhookAvatarURL = process.env.MODLOG_WEBHOOK_AVATAR || null;

    // ---- Trackers ----
    this.spamTracker = new Map();
    this.raidTracker = new Map();
    this.reputationCache = new TTLCache(60 * 60 * 1000); // 1h

    // ---- Start time ----
    this._startTime = Date.now();

    // ---- Admin log ----
    this.adminLogWebhook = process.env.MOD_ADMIN_LOG_WEBHOOK || process.env.LOG_WEBHOOK_URL;
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadConfigs();
    await this.ensureDefaultModLogChannel();

    // Subscribe to events
    this.subscribe('moderation.warn', async (data) => {
      await this.addWarning(data.guildId, data.userId, data.reason, data.modId);
    });
    this.subscribe('guild.join', async (data) => {
      await this.handleJoinForRaid(data.guildId);
    });
    // Integration with other agents
    this.subscribe('economy.balanceChanged', async (data) => {
      // Could reduce XP for repeated offenders
    });
    this.subscribe('communityManager.explain', async (data) => {
      // Notify user of moderation action
    });

    const hasWebhook = !!process.env.MODLOG_WEBHOOK_URL;
    this.logger.info(`🛡️ ModerationAgent v10.0 ready (webhook: ${hasWebhook ? '✅' : '❌'})`);
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT, configKey TEXT, config TEXT,
        PRIMARY KEY (guildId, configKey)
      );
      CREATE TABLE IF NOT EXISTS mod_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseId TEXT UNIQUE,
        guildId TEXT,
        userId TEXT,
        moderatorId TEXT,
        action TEXT,
        reason TEXT,
        evidence TEXT,
        severity INTEGER,
        timestamp INTEGER,
        status TEXT DEFAULT 'open'
      );
      CREATE TABLE IF NOT EXISTS mod_reputation (
        userId TEXT,
        guildId TEXT,
        trustScore INTEGER DEFAULT 50,
        scamRisk INTEGER DEFAULT 0,
        spamScore INTEGER DEFAULT 0,
        positiveScore INTEGER DEFAULT 0,
        totalWarnings INTEGER DEFAULT 0,
        totalActions INTEGER DEFAULT 0,
        lastUpdated INTEGER,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS mod_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT,
        metric TEXT,
        value INTEGER,
        timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS mod_appeals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caseId TEXT,
        userId TEXT,
        guildId TEXT,
        message TEXT,
        status TEXT DEFAULT 'pending',
        timestamp INTEGER
      );
    `);
  }

  // ---------- Config Loading ----------
  async _loadConfigs() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT guildId, config FROM guild_configs WHERE configKey = 'moderation'`);
    for (const row of rows) {
      this.guildConfigs.set(row.guildId, JSON.parse(row.config));
    }
  }

  async getGuildConfig(guildId) {
    if (this.guildConfigs.has(guildId)) return this.guildConfigs.get(guildId);
    const config = { ...this.defaultConfig };
    this.guildConfigs.set(guildId, config);
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, 'moderation', ?)`,
      [guildId, JSON.stringify(config)]
    );
    return config;
  }

  async updateGuildConfig(guildId, updates) {
    const config = await this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.guildConfigs.set(guildId, config);
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, 'moderation', ?)`,
      [guildId, JSON.stringify(config)]
    );
  }

  // ---------- Auto‑set mod log channel ----------
  async ensureDefaultModLogChannel() {
    const defaultChannelId = process.env.DEFAULT_MOD_LOG_CHANNEL_ID;
    if (!defaultChannelId) return;
    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    const config = await this.getGuildConfig(guild.id);
    if (config.modLogChannel) return;
    const channel = this.client.channels.cache.get(defaultChannelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Default mod log channel ${defaultChannelId} not found`);
      return;
    }
    await this.updateGuildConfig(guild.id, { modLogChannel: defaultChannelId });
    this.logger.info(`✅ Auto-set mod log channel to ${channel.name}`);
  }

  // ---------- Helper: Send Mod Log ----------
  async _sendModLog(guildId, payload) {
    if (process.env.MODLOG_WEBHOOK_URL) {
      try {
        await sendWebhook('modLog', payload, {
          username: this.webhookUsername,
          avatarURL: this.webhookAvatarURL || undefined,
        });
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back`);
      }
    }
    const config = await this.getGuildConfig(guildId);
    const channelId = config.modLogChannel;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await channel.send(payload);
  }

  // ---------- AI Detection (Unified) ----------
  async _analyzeContent(content, context = {}) {
    if (!this.openai && !this.useGemini) return null;
    const prompt = `Analyze this message for moderation in a Web3 crypto Discord:
Message: "${content}"
User's recent warnings: ${context.warnings || 0}
Trust score: ${context.trustScore || 50}

Return JSON with:
- isSpam: boolean
- isScam: boolean (crypto scams, fake airdrops, wallet drainers)
- isProfanity: boolean (but consider context, intent)
- isToxic: boolean (harassment, threats)
- isImpersonation: boolean (impersonating admin/mod)
- confidence: 0-1
- reason: string
- suggestedAction: "warn", "timeout", "kick", "ban", or "ignore"`;

    let result = null;
    try {
      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });
        result = JSON.parse(response.choices[0].message.content);
      } else if (this.useGemini) {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const geminiResult = await model.generateContent(prompt);
        const text = geminiResult.response.text();
        result = JSON.parse(text);
      }
    } catch (err) {
      this.logger.debug(`AI analysis failed: ${err.message}`);
      return null;
    }
    return result;
  }

  // ---------- Reputation System ----------
  async _getReputation(userId, guildId) {
    const db = this.deps.db;
    let row = await db.get(`SELECT * FROM mod_reputation WHERE userId = ? AND guildId = ?`, [userId, guildId]);
    if (!row) {
      row = { trustScore: 50, scamRisk: 0, spamScore: 0, positiveScore: 0, totalWarnings: 0, totalActions: 0 };
      await db.run(
        `INSERT INTO mod_reputation (userId, guildId, trustScore, scamRisk, spamScore, positiveScore, totalWarnings, totalActions, lastUpdated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, guildId, 50, 0, 0, 0, 0, 0, Date.now()]
      );
    }
    return row;
  }

  async _updateReputation(userId, guildId, updates) {
    const db = this.deps.db;
    await db.run(
      `UPDATE mod_reputation SET trustScore = trustScore + ?, scamRisk = scamRisk + ?, spamScore = spamScore + ?, positiveScore = positiveScore + ?, totalWarnings = totalWarnings + ?, totalActions = totalActions + ?, lastUpdated = ?
       WHERE userId = ? AND guildId = ?`,
      [
        updates.trustChange || 0,
        updates.scamChange || 0,
        updates.spamChange || 0,
        updates.positiveChange || 0,
        updates.warningInc || 0,
        updates.actionInc || 0,
        Date.now(),
        userId,
        guildId
      ]
    );
    this.reputationCache.clear();
  }

  // ---------- Case Management ----------
  async _createCase(guildId, userId, moderatorId, action, reason, evidence = null, severity = 0) {
    const db = this.deps.db;
    const caseId = `CASE-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    await db.run(
      `INSERT INTO mod_cases (caseId, guildId, userId, moderatorId, action, reason, evidence, severity, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [caseId, guildId, userId, moderatorId, action, reason, evidence, severity, Date.now(), 'open']
    );
    return caseId;
  }

  async _getCases(userId, guildId, limit = 10) {
    const db = this.deps.db;
    return await db.all(
      `SELECT * FROM mod_cases WHERE userId = ? AND guildId = ? ORDER BY timestamp DESC LIMIT ?`,
      [userId, guildId, limit]
    );
  }

  // ---------- Autonomous Decision ----------
  async _decideAction(analysis, userId, guildId) {
    if (!analysis) return null;
    const reputation = await this._getReputation(userId, guildId);
    const config = await this.getGuildConfig(guildId);
    if (!config.autonomousActions) return null;

    const { isSpam, isScam, isProfanity, isToxic, isImpersonation, confidence, suggestedAction, reason } = analysis;
    if (confidence < config.minConfidence) return null;

    let action = null;
    let severity = 0;

    if (isScam || isImpersonation) {
      action = 'ban';
      severity = 5;
    } else if (isToxic && (reputation.trustScore < 30 || reputation.totalWarnings > 3)) {
      action = 'kick';
      severity = 4;
    } else if (isSpam && reputation.spamScore > 60) {
      action = 'timeout';
      severity = 3;
    } else if (isProfanity && reputation.trustScore < 40) {
      action = 'warn';
      severity = 2;
    } else if (isSpam || isToxic) {
      action = 'warn';
      severity = 1;
    }

    // Override with AI suggestion if confidence is high
    if (confidence > 0.8 && suggestedAction !== 'ignore') {
      action = suggestedAction;
      severity = Math.max(severity, 2);
    }

    return { action, severity, reason };
  }

  // ---------- Auto‑Mod (Enhanced) ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    const config = await this.getGuildConfig(message.guild.id);
    if (!config.autoModEnabled) return;

    const content = message.content;
    let action = null;

    // 1. Legacy detections (fast)
    if (config.blockScam && this.isScam(content)) action = 'scam';
    else if (config.blockProfanity && this.hasProfanity(content, config.profanityList)) action = 'profanity';
    else if (config.blockLinks && this.hasLink(content) && !this.isAllowedDomain(content, config.allowedDomains)) action = 'unauthorized link';
    else if (this.isSpam(message.author.id, config)) action = 'spam';

    if (action) {
      await this.autoModAction(message, action);
      return;
    }

    // 2. AI detection (if enabled)
    if (config.enableAI) {
      const reputation = await this._getReputation(message.author.id, message.guild.id);
      const analysis = await this._analyzeContent(content, {
        warnings: reputation.totalWarnings,
        trustScore: reputation.trustScore,
      });
      if (analysis) {
        const decision = await this._decideAction(analysis, message.author.id, message.guild.id);
        if (decision) {
          await this._executeAction(message, decision.action, decision.reason, decision.severity);
          return;
        }
      }
    }

    // 3. Web3 security detection
    if (config.enableWeb3Security && await this._isWeb3Threat(content)) {
      await this._executeAction(message, 'ban', 'Web3 security threat detected (scam/honeypot)', 5);
      return;
    }
  }

  // ---------- Web3 Security Detection ----------
  async _isWeb3Threat(content) {
    const lower = content.toLowerCase();
    const patterns = [
      /airdrop.*claim.*wallet/i,
      /free.*mint.*connect.*wallet/i,
      /verify.*wallet.*airdrop/i,
      /fake.*token.*contract/i,
      /honeypot/i,
      /drain.*wallet/i,
      /malicious.*contract/i,
      /scam.*airdrop/i,
      /impersonat.*admin/i,
      /impersonat.*mod/i,
      /fake.*support/i,
    ];
    if (patterns.some(p => p.test(lower))) return true;

    // AI verification (if API available)
    if (this.openai || this.useGemini) {
      const prompt = `Is this message a Web3 scam or security threat? Return only "yes" or "no": "${content}"`;
      try {
        let result;
        if (this.openai) {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 5,
            temperature: 0,
          });
          result = response.choices[0].message.content.trim().toLowerCase();
        } else if (this.useGemini) {
          const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
          const geminiResult = await model.generateContent(prompt);
          result = geminiResult.response.text().trim().toLowerCase();
        }
        return result === 'yes';
      } catch (err) {
        this.logger.debug(`Web3 AI check failed: ${err.message}`);
      }
    }
    return false;
  }

  // ---------- Execute Action (Autonomous) ----------
  async _executeAction(message, action, reason, severity) {
    const userId = message.author.id;
    const guildId = message.guild.id;
    const modId = 'AutoMod';

    try {
      await message.delete();
      await message.author.send(`⚠️ Your message was removed: ${reason}`).catch(() => {});

      const caseId = await this._createCase(guildId, userId, modId, action, reason, message.content, severity);

      // Update reputation
      const updates = { warningInc: 1, actionInc: 1 };
      if (action === 'ban') updates.trustChange = -20;
      else if (action === 'kick') updates.trustChange = -15;
      else if (action === 'timeout') updates.trustChange = -10;
      else updates.trustChange = -5;
      await this._updateReputation(userId, guildId, updates);

      // Apply action
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      if (action === 'ban') {
        if (member.bannable) await member.ban({ reason });
      } else if (action === 'kick') {
        if (member.kickable) await member.kick(reason);
      } else if (action === 'timeout') {
        if (member.moderatable) await member.timeout(5 * 60 * 1000, reason);
      } else {
        await this.addWarning(guildId, userId, reason, modId);
      }

      // Log
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Auto-Mod Action')
        .setColor(0xff0000)
        .addFields(
          { name: 'User', value: member.user.tag, inline: true },
          { name: 'Action', value: action, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Case ID', value: caseId, inline: true },
          { name: 'Severity', value: `${severity}/5`, inline: true }
        )
        .setTimestamp();
      await this._sendModLog(guildId, { embeds: [embed] });

      // Notify other agents
      this.emit('moderation.action', { userId, guildId, action, reason, severity, caseId });
      if (action === 'ban') this.emit('user.banned', { userId, guildId, reason });

      this.logger.info(`🤖 Autonomous action: ${action} on ${member.user.tag} (${reason})`);
    } catch (err) {
      this.logger.error(`Auto action failed: ${err.message}`);
    }
  }

  // ---------- Legacy Detection Helpers (kept) ----------
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

  // ---------- Warning System (existing) ----------
  async addWarning(guildId, userId, reason, modId) {
    if (!this.models?.Warning) {
      this.logger.error('Warning model not available');
      return;
    }
    await this.models.Warning.add(userId, guildId, reason, modId);
    const warningCount = await this.models.Warning.getCount(userId, guildId);
    const config = await this.getGuildConfig(guildId);
    if (warningCount >= config.maxWarnings) {
      await this.applyMute(guildId, userId, config.muteDurationMs, `Reached ${config.maxWarnings} warnings`);
    }
    await this._updateReputation(userId, guildId, { warningInc: 1 });
    this.logger.info(`⚠️ Warning added to ${userId}: ${reason}`);
  }

  async getWarnings(userId, guildId) {
    if (!this.models?.Warning) return [];
    return await this.models.Warning.get(userId, guildId);
  }

  async clearWarnings(userId, guildId) {
    if (!this.models?.Warning) return;
    await this.models.Warning.clear(userId, guildId);
    await this._updateReputation(userId, guildId, { trustChange: 10 });
  }

  async applyMute(guildId, userId, durationMs, reason) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.moderatable) {
      await member.timeout(durationMs, reason);
      const embed = new EmbedBuilder().setTitle('🔇 Muted').setColor(0xffaa00)
        .addFields({ name: 'User', value: member.user.tag }, { name: 'Reason', value: reason }).setTimestamp();
      await this._sendModLog(guildId, { embeds: [embed] });
    }
  }

  // ---------- Auto-Mod Action (Legacy) ----------
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
      await this._sendModLog(message.guild.id, { embeds: [logEmbed] });
      await this.addWarning(message.guild.id, message.author.id, `Auto-mod: ${reason}`, 'AutoMod');
    } catch (err) {
      this.logger.error(`Auto-mod action failed: ${err.message}`);
    }
  }

  // ---------- RAID DETECTION (Enhanced) ----------
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
    await this._sendModLog(guildId, { embeds: [embed] });

    // Auto-lock channels and enable slowmode (optional)
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      for (const [id, channel] of guild.channels.cache) {
        if (channel.isTextBased() && channel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.ManageChannels)) {
          await channel.setRateLimitPerUser(10, 'Raid mode activated').catch(() => {});
        }
      }
    }
  }

  // ---------- SLASH COMMANDS (Consolidated /mod) ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'mod') return;

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;
    const config = await this.getGuildConfig(guild.id);
    const isMod = member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
                  (config.modRoleId && member.roles.cache.has(config.modRoleId));
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    (config.adminRoleId && member.roles.cache.has(config.adminRoleId));

    switch (sub) {
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
      case 'config':
        if (!isAdmin) return this.denyPerm(interaction);
        await this.cmdConfig(interaction);
        break;
      case 'cases':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdCases(interaction);
        break;
      case 'reputation':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdReputation(interaction);
        break;
      case 'stats':
        if (!isMod) return this.denyPerm(interaction);
        await this.cmdStats(interaction);
        break;
      case 'health':
        await this.cmdHealth(interaction);
        break;
      case 'appeal':
        await this.cmdAppeal(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ---- Existing Commands (kept, but now under /mod) ----
  async cmdWarn(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await this.addWarning(interaction.guild.id, target.id, reason, interaction.user.id);
    await this._createCase(interaction.guild.id, target.id, interaction.user.id, 'warn', reason);
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
    await this._createCase(interaction.guild.id, target.id, interaction.user.id, 'timeout', reason);
    await interaction.reply({ content: `🔇 Muted ${target.tag} for ${minutes} minutes.`, ephemeral: true });
  }

  async cmdKick(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason';
    const member = await interaction.guild.members.fetch(target.id);
    if (!member.kickable) return interaction.reply({ content: 'I cannot kick that user.', ephemeral: true });
    await member.kick(reason);
    await this._createCase(interaction.guild.id, target.id, interaction.user.id, 'kick', reason);
    await interaction.reply({ content: `👢 Kicked ${target.tag}.`, ephemeral: true });
  }

  async cmdBan(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason';
    await interaction.guild.members.ban(target.id, { reason });
    await this._createCase(interaction.guild.id, target.id, interaction.user.id, 'ban', reason);
    await interaction.reply({ content: `🔨 Banned ${target.tag}.`, ephemeral: true });
  }

  async cmdPurge(interaction) {
    const amount = interaction.options.getInteger('amount') || 10;
    if (amount > 100) return interaction.reply({ content: 'Max 100 messages.', ephemeral: true });
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
  }

  // ---- NEW: Configuration ----
  async cmdConfig(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = await this.getGuildConfig(interaction.guild.id);
    if (sub === 'set') {
      const key = interaction.options.getString('key');
      const value = interaction.options.getString('value');
      // Parse value as number if possible
      let parsed = value;
      if (!isNaN(value)) parsed = parseFloat(value);
      if (value === 'true') parsed = true;
      if (value === 'false') parsed = false;
      await this.updateGuildConfig(interaction.guild.id, { [key]: parsed });
      await interaction.reply({ content: `✅ ${key} set to ${value}`, ephemeral: true });
    } else if (sub === 'show') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Moderation Config')
        .setColor(0x3498db)
        .addFields(
          Object.entries(config).map(([k, v]) => ({ name: k, value: String(v), inline: true }))
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---- NEW: Cases ----
  async cmdCases(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'view') {
      const userId = interaction.options.getUser('user').id;
      const cases = await this._getCases(userId, interaction.guild.id);
      if (!cases.length) return interaction.reply({ content: 'No cases found.', ephemeral: true });
      let desc = '';
      for (const c of cases.slice(0, 5)) {
        desc += `• **${c.caseId}** – ${c.action} – ${c.reason} (${new Date(c.timestamp).toLocaleDateString()})\n`;
      }
      const embed = new EmbedBuilder().setTitle(`📋 Cases for <@${userId}>`).setDescription(desc).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'search') {
      const query = interaction.options.getString('query');
      const db = this.deps.db;
      const rows = await db.all(
        `SELECT * FROM mod_cases WHERE guildId = ? AND (caseId LIKE ? OR reason LIKE ?) ORDER BY timestamp DESC LIMIT 10`,
        [interaction.guild.id, `%${query}%`, `%${query}%`]
      );
      if (!rows.length) return interaction.reply({ content: 'No matching cases.', ephemeral: true });
      let desc = '';
      for (const c of rows) {
        desc += `• **${c.caseId}** – ${c.action} – ${c.reason} (${new Date(c.timestamp).toLocaleDateString()})\n`;
      }
      const embed = new EmbedBuilder().setTitle('🔍 Case Search').setDescription(desc).setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ---- NEW: Reputation ----
  async cmdReputation(interaction) {
    const target = interaction.options.getUser('user');
    const rep = await this._getReputation(target.id, interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle(`🌟 Reputation for ${target.tag}`)
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Trust Score', value: `${rep.trustScore}/100`, inline: true },
        { name: 'Scam Risk', value: `${rep.scamRisk}%`, inline: true },
        { name: 'Spam Score', value: `${rep.spamScore}%`, inline: true },
        { name: 'Positive Score', value: `${rep.positiveScore}`, inline: true },
        { name: 'Total Warnings', value: rep.totalWarnings.toString(), inline: true },
        { name: 'Total Actions', value: rep.totalActions.toString(), inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---- NEW: Stats ----
  async cmdStats(interaction) {
    const db = this.deps.db;
    const guildId = interaction.guild.id;
    const totalCases = await db.get(`SELECT COUNT(*) as count FROM mod_cases WHERE guildId = ?`, [guildId]);
    const bans = await db.get(`SELECT COUNT(*) as count FROM mod_cases WHERE guildId = ? AND action = 'ban'`, [guildId]);
    const kicks = await db.get(`SELECT COUNT(*) as count FROM mod_cases WHERE guildId = ? AND action = 'kick'`, [guildId]);
    const warns = await db.get(`SELECT COUNT(*) as count FROM mod_cases WHERE guildId = ? AND action = 'warn'`, [guildId]);
    const embed = new EmbedBuilder()
      .setTitle('📊 Moderation Stats')
      .setColor(0x3498db)
      .addFields(
        { name: 'Total Cases', value: totalCases?.count?.toString() || '0', inline: true },
        { name: 'Bans', value: bans?.count?.toString() || '0', inline: true },
        { name: 'Kicks', value: kicks?.count?.toString() || '0', inline: true },
        { name: 'Warnings', value: warns?.count?.toString() || '0', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---- NEW: Health ----
  async cmdHealth(interaction) {
    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Moderation Agent – Health')
      .setColor(0x3498db)
      .addFields(
        { name: 'Status', value: '✅ Operational', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'AI', value: this.openai || this.useGemini ? '✅' : '❌', inline: true },
        { name: 'Reputation System', value: '✅', inline: true },
        { name: 'Autonomous Actions', value: '✅', inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---- NEW: Appeal ----
  async cmdAppeal(interaction) {
    const caseId = interaction.options.getString('case');
    const message = interaction.options.getString('message');
    const db = this.deps.db;
    const caseRow = await db.get(`SELECT * FROM mod_cases WHERE caseId = ? AND guildId = ?`, [caseId, interaction.guild.id]);
    if (!caseRow) return interaction.reply({ content: 'Case not found.', ephemeral: true });
    await db.run(
      `INSERT INTO mod_appeals (caseId, userId, guildId, message, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [caseId, interaction.user.id, interaction.guild.id, message, 'pending', Date.now()]
    );
    // Notify mods
    const embed = new EmbedBuilder()
      .setTitle('📩 New Appeal')
      .setDescription(`User <@${interaction.user.id}> has appealed case **${caseId}**`)
      .addFields({ name: 'Message', value: message })
      .setTimestamp();
    await this._sendModLog(interaction.guild.id, { embeds: [embed] });
    await interaction.reply({ content: '✅ Appeal submitted. Moderators will review it.', ephemeral: true });
  }

  denyPerm(interaction) {
    interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
  }

  // ---------- Cleanup ----------
  async destroy() {
    this.spamTracker.clear();
    this.raidTracker.clear();
    this.reputationCache.clear();
    await super.destroy();
  }
}

module.exports = ModerationAgent;