/**
 * ⚡ OptimizationAgent v10.1 (Webhook Ready)
 * - Advanced self‑healing, monitoring, and performance optimization
 * - Slash commands: /bothealth, /apistats
 * - Predictive memory analysis, API quota alerts, log rotation
 * - Agent dependency graph, restart cooldown, deep cache cleanup
 * - Critical alerts via Discord webhook (Sentinel)
 * - Performance reports via Discord webhook (Analyst)
 * - Falls back to channel.send if webhook URL missing
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, SlashCommandBuilder, WebhookClient } = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

class OptimizationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Performance Tracking ----
    this.agentErrors = new Map();
    this.agentResponseTimes = new Map();
    this.agentLastRestart = new Map();
    this.apiUsage = {
      coingecko: { calls: 0, limit: 10000, lastReset: Date.now() },
      openai: { calls: 0, limit: 100000, lastReset: Date.now() },
      newsdata: { calls: 0, limit: 1000, lastReset: Date.now() },
    };

    // ---- Thresholds ----
    this.errorThreshold = 10;
    this.memoryThreshold = 80;
    this.slowQueryThreshold = 100; // ms
    this.restartCooldownMs = 5 * 60 * 1000; // 5 minutes
    this.logFileMaxSize = 10 * 1024 * 1024; // 10 MB
    this.tempFileAgeDays = 7;

    // ---- Cache & History ----
    this.cacheRefs = [];
    this.memoryHistory = [];
    this.queryHistory = [];
    this.alertCooldown = new Map();

    // ---- Webhook configs ----
    this.reportWebhookUrl = process.env.PERFORMANCE_REPORT_WEBHOOK_URL || process.env.BOT_LOGS_WEBHOOK_URL;
    this.reportWebhookUsername = 'Analyst';
    this.reportWebhookAvatar = process.env.PERFORMANCE_REPORT_WEBHOOK_AVATAR || null;

    this.alertWebhookUrl = process.env.ALERT_WEBHOOK_URL || process.env.BOT_LOGS_WEBHOOK_URL;
    this.alertWebhookUsername = 'Sentinel';
    this.alertWebhookAvatar = process.env.ALERT_WEBHOOK_AVATAR || null;

    // ---- Report Channels (fallback) ----
    this.reportChannelId = process.env.BOT_LOGS_CHANNEL_ID || process.env.MODLOG_CHANNEL_ID;
    this.alertChannelId = process.env.ALERT_CHANNEL_ID || process.env.BOT_LOGS_CHANNEL_ID;

    // ---- Agent Dependency Map ----
    this.dependencies = {
      NewsAgent: ['AlertPrioritizationAgent', 'SummaryAgent'],
      AlertPrioritizationAgent: ['SummaryAgent'],
      WhaleAgent: ['SignalAgent', 'RecommendationAgent'],
      SignalAgent: ['RecommendationAgent'],
    };

    // ---- File cleanup ----
    this.tempDir = path.join(__dirname, '..', 'tmp');
  }

  async init() {
    await super.init();

    // ---- Subscriptions ----
    this.subscribe('job.healthCheck', async () => this._healthCheck());
    this.subscribe('job.cacheCleanup', async () => this._cacheCleanup());
    this.subscribe('job.performanceReport', async () => this._generatePerformanceReport());
    this.subscribe('job.memoryMonitor', async () => this._memoryMonitor());
    this.subscribe('job.logRotation', async () => this._logRotation());
    this.subscribe('job.tempCleanup', async () => this._tempCleanup());
    this.subscribe('orchestrator.error', async (data) => this._trackError(data));

    // ---- Create temp dir if missing ----
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });

    this.logger.info(`⚡ OptimizationAgent v10.1 ready (reports via ${this.reportWebhookUrl ? 'Analyst webhook' : 'channel.send'})`);
  }

  // ---------- Helper: Send via Webhook or Channel ----------
  async _sendWebhookMessage(embed, webhookUrl, username, avatarURL, channelId) {
    // 1. Try webhook if available
    if (webhookUrl) {
      try {
        const webhook = new WebhookClient({ url: webhookUrl });
        await webhook.send({
          username: username,
          avatarURL: avatarURL || undefined,
          embeds: [embed],
        });
        this.logger.debug(`✅ Message sent via webhook (${username})`);
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to channel.send`);
      }
    }

    // 2. Fallback to channel.send
    if (!channelId) {
      this.logger.warn('No channel ID provided for fallback');
      return;
    }
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Channel ${channelId} not found or not text-based`);
      return;
    }
    await channel.send({ embeds: [embed] });
    this.logger.debug(`✅ Message sent via channel.send to #${channel.name}`);
  }

  // ===================== SLASH COMMANDS =====================
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'bothealth':
        await this.cmdHealth(interaction);
        break;
      case 'apistats':
        await this.cmdApiStats(interaction);
        break;
    }
  }

  async cmdHealth(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const agents = this.deps.orchestrator?.getAllAgents?.() || [];
    let desc = '';
    for (const agent of agents) {
      const name = agent.constructor.name;
      const errors = this.agentErrors.get(name);
      const lastRestart = this.agentLastRestart.get(name);
      const status = errors && errors.count > 5 ? '⚠️' : '✅';
      const restartTime = lastRestart ? `<t:${Math.floor(lastRestart / 1000)}:R>` : 'Never';
      desc += `${status} **${name}** — ${errors ? errors.count : 0} errors — restarted ${restartTime}\n`;
    }

    const memory = process.memoryUsage();
    const embed = new EmbedBuilder()
      .setTitle('🩺 Bot Health Dashboard')
      .setColor(0x00ff88)
      .setDescription(desc || 'No agents registered.')
      .addFields(
        { name: '💾 Memory', value: `${(memory.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(memory.heapTotal / 1024 / 1024).toFixed(0)}MB (${(memory.heapUsed / memory.heapTotal * 100).toFixed(1)}%)`, inline: true },
        { name: '⏱️ Uptime', value: `${(process.uptime() / 3600).toFixed(1)} hours`, inline: true },
        { name: '🤖 Agents', value: `${agents.length} loaded`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Optimization AI v10.1' });

    await interaction.editReply({ embeds: [embed] });
  }

  async cmdApiStats(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let desc = '';
    for (const [key, data] of Object.entries(this.apiUsage)) {
      const percent = (data.calls / data.limit * 100).toFixed(1);
      const bar = '█'.repeat(Math.min(Math.floor(percent / 10), 10)) + '░'.repeat(Math.max(10 - Math.floor(percent / 10), 0));
      desc += `• **${key}**: ${data.calls} / ${data.limit} calls (${percent}%) ${bar}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📡 API Usage Stats')
      .setColor(0x3498db)
      .setDescription(desc)
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Optimization AI v10.1' });

    await interaction.editReply({ embeds: [embed] });
  }

  // ===================== HEALTH CHECK =====================
  async _healthCheck() {
    const agents = this.deps.orchestrator?.getAllAgents?.() || [];
    let unhealthy = [];

    for (const agent of agents) {
      const name = agent.constructor.name;
      try {
        if (typeof agent.healthCheck === 'function') {
          const result = await agent.healthCheck();
          if (result && result.status === 'error') {
            unhealthy.push(name);
          }
        }
      } catch {
        unhealthy.push(name);
      }
    }

    if (unhealthy.length > 0) {
      this.logger.warn(`⚠️ Unhealthy agents: ${unhealthy.join(', ')}`);
      for (const name of unhealthy) {
        await this._safeRestart(name);
      }
    }
  }

  // ===================== SAFE RESTART WITH COOLDOWN =====================
  async _safeRestart(agentName) {
    const last = this.agentLastRestart.get(agentName) || 0;
    if (Date.now() - last < this.restartCooldownMs) {
      this.logger.warn(`⏳ Cooldown active for ${agentName} – restart skipped`);
      return;
    }

    const agent = this.deps.orchestrator?.getAgent(agentName);
    if (!agent) return;

    try {
      await agent.init();
      this.agentLastRestart.set(agentName, Date.now());
      this.logger.info(`🔄 Restarted ${agentName}`);

      // Restart dependencies
      if (this.dependencies[agentName]) {
        for (const dep of this.dependencies[agentName]) {
          await this._safeRestart(dep);
        }
      }

      // Send alert if this agent has restarted too often
      const restartCount = this.agentErrors.get(agentName)?.restarts || 0;
      if (restartCount > 3) {
        await this._sendAlert(`⚠️ Agent **${agentName}** has been restarted ${restartCount} times recently.`);
      }
    } catch (err) {
      this.logger.error(`❌ Failed to restart ${agentName}: ${err.message}`);
    }
  }

  // ===================== CACHE CLEANUP =====================
  async _cacheCleanup() {
    // Clean PriceAgent cache
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    if (priceAgent?.priceCache) {
      const oldSize = priceAgent.priceCache.size;
      for (const [key, value] of priceAgent.priceCache) {
        if (Date.now() - value.timestamp > 30 * 60 * 1000) {
          priceAgent.priceCache.delete(key);
        }
      }
      this.logger.debug(`🧹 PriceAgent cache: ${oldSize} → ${priceAgent.priceCache.size}`);
    }

    // Clean WhaleAgent cache
    const whaleAgent = this.deps.orchestrator?.getAgent('WhaleAgent');
    if (whaleAgent?.seenTxs) {
      const oldSize = whaleAgent.seenTxs.size;
      whaleAgent._cleanCache?.();
      this.logger.debug(`🐋 WhaleAgent cache: ${oldSize} → ${whaleAgent.seenTxs.size}`);
    }

    // Clean SummaryAgent cache
    const summaryAgent = this.deps.orchestrator?.getAgent('SummaryAgent');
    if (summaryAgent?.cache) {
      const oldSize = summaryAgent.cache.size;
      for (const [key, value] of summaryAgent.cache) {
        if (Date.now() - value.timestamp > 60 * 60 * 1000) {
          summaryAgent.cache.delete(key);
        }
      }
      this.logger.debug(`📝 SummaryAgent cache: ${oldSize} → ${summaryAgent.cache.size}`);
    }

    // Clean SignalAgent price history
    const signalAgent = this.deps.orchestrator?.getAgent('SignalAgent');
    if (signalAgent?.priceHistory) {
      for (const [coin, history] of signalAgent.priceHistory) {
        if (history.length > 50) {
          signalAgent.priceHistory.set(coin, history.slice(-50));
        }
      }
    }

    // Clean RecommendationAgent cache
    const recAgent = this.deps.orchestrator?.getAgent('RecommendationAgent');
    if (recAgent?.recommendationCache) {
      const oldSize = recAgent.recommendationCache.size;
      for (const [key, timestamp] of recAgent.recommendationCache) {
        if (Date.now() - timestamp > recAgent.cacheTTL) {
          recAgent.recommendationCache.delete(key);
        }
      }
      this.logger.debug(`🧠 RecAgent cache: ${oldSize} → ${recAgent.recommendationCache.size}`);
    }

    // API usage reset (monthly)
    const now = Date.now();
    for (const [key, data] of Object.entries(this.apiUsage)) {
      if (now - data.lastReset > 30 * 24 * 60 * 60 * 1000) {
        data.calls = 0;
        data.lastReset = now;
        this.logger.debug(`📊 Reset API usage for ${key}`);
      }
    }
  }

  // ===================== ERROR TRACKING =====================
  async _trackError(data) {
    const agentName = data.agent || 'unknown';
    if (!this.agentErrors.has(agentName)) {
      this.agentErrors.set(agentName, { count: 0, errors: [], restarts: 0, lastReset: Date.now() });
    }
    const entry = this.agentErrors.get(agentName);
    entry.count++;
    entry.errors.push({ message: data.error?.message || 'Unknown error', timestamp: Date.now() });
    if (entry.errors.length > 50) entry.errors.shift();

    // If error count exceeds threshold, restart
    if (entry.count > this.errorThreshold) {
      this.logger.warn(`⚠️ Agent ${agentName} has ${entry.count} errors – restarting...`);
      await this._safeRestart(agentName);
      entry.restarts = (entry.restarts || 0) + 1;
      entry.count = 0;
    }
  }

  // ===================== MEMORY MONITOR =====================
  async _memoryMonitor() {
    const memory = process.memoryUsage();
    const usagePercent = (memory.heapUsed / memory.heapTotal) * 100;
    this.memoryHistory.push({ usage: usagePercent, timestamp: Date.now() });
    if (this.memoryHistory.length > 100) this.memoryHistory.shift();

    this.logger.debug(`💾 Memory: ${usagePercent.toFixed(1)}% (${(memory.heapUsed / 1024 / 1024).toFixed(0)}MB)`);

    // Predict if memory will exceed threshold in next hour
    if (this.memoryHistory.length > 5) {
      const recent = this.memoryHistory.slice(-5);
      const avgTrend = recent.reduce((sum, h) => sum + h.usage, 0) / recent.length;
      const last = recent[recent.length - 1].usage;
      const trend = (last - avgTrend) / (recent.length - 1);
      const predicted = last + trend * 6; // 6 data points = 1.5 hours
      if (predicted > this.memoryThreshold) {
        this.logger.warn(`⚠️ Predicted memory > ${this.memoryThreshold}% in ~1.5h – triggering cleanup`);
        await this._cacheCleanup();
        if (global.gc) global.gc();
      }
    }

    if (usagePercent > this.memoryThreshold) {
      this.logger.warn(`⚠️ Memory at ${usagePercent.toFixed(1)}% – triggering cleanup`);
      await this._cacheCleanup();
      if (global.gc) global.gc();
      await this._sendAlert(`⚠️ Memory usage at ${usagePercent.toFixed(1)}%. Cleanup triggered.`);
    }
  }

  // ===================== LOG ROTATION =====================
  async _logRotation() {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) return;

    const files = fs.readdirSync(logDir);
    for (const file of files) {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && stats.size > this.logFileMaxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const newName = `${path.basename(file, '.log')}_${timestamp}.log.gz`;
        const newPath = path.join(logDir, newName);
        const zlib = require('zlib');
        const readStream = fs.createReadStream(filePath);
        const writeStream = fs.createWriteStream(newPath);
        const gzip = zlib.createGzip();
        readStream.pipe(gzip).pipe(writeStream);
        fs.truncateSync(filePath, 0);
        this.logger.info(`📦 Rotated and compressed: ${file} → ${newName}`);
      }
    }
  }

  // ===================== TEMP FILE CLEANUP =====================
  async _tempCleanup() {
    if (!fs.existsSync(this.tempDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(this.tempDir);
    for (const file of files) {
      const filePath = path.join(this.tempDir, file);
      const stats = fs.statSync(filePath);
      const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > this.tempFileAgeDays) {
        fs.unlinkSync(filePath);
        this.logger.debug(`🗑️ Deleted old temp file: ${file}`);
      }
    }
  }

  // ===================== ALERT SYSTEM (Webhook) =====================
  async _sendAlert(message) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 Bot Alert')
      .setDescription(message)
      .setColor(0xff4444)
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Optimization AI v10.1' });

    await this._sendWebhookMessage(
      embed,
      this.alertWebhookUrl,
      this.alertWebhookUsername,
      this.alertWebhookAvatar,
      this.alertChannelId
    );
  }

  // ===================== PERFORMANCE REPORT (Webhook) =====================
  async _generatePerformanceReport() {
    const agents = this.deps.orchestrator?.getAllAgents?.() || [];
    let agentStatus = '';
    for (const agent of agents) {
      const name = agent.constructor.name;
      const errors = this.agentErrors.get(name);
      const errorCount = errors ? errors.count : 0;
      const status = errorCount > 5 ? '⚠️' : '✅';
      const lastRestart = this.agentLastRestart.get(name);
      agentStatus += `${status} **${name}** — ${errorCount} errors — ${lastRestart ? `restarted ${Math.floor((Date.now() - lastRestart) / 3600000)}h ago` : 'never'}\n`;
    }

    const memory = process.memoryUsage();
    const predicted = this.memoryHistory.length > 5 ? this.memoryHistory.slice(-5).reduce((s, h) => s + h.usage, 0) / 5 : 0;

    let apiSummary = '';
    for (const [key, data] of Object.entries(this.apiUsage)) {
      const percent = (data.calls / data.limit * 100).toFixed(1);
      apiSummary += `• ${key}: ${data.calls} / ${data.limit} (${percent}%)\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Weekly Performance Report')
      .setColor(0x00ff88)
      .setDescription(`📅 **${new Date().toLocaleDateString()}**`)
      .addFields(
        { name: '🤖 Agent Status', value: agentStatus || 'No agents', inline: false },
        { name: '📡 API Usage', value: apiSummary || 'No data', inline: false },
        { name: '💾 Memory', value: `${(memory.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(memory.heapTotal / 1024 / 1024).toFixed(0)}MB (${(memory.heapUsed / memory.heapTotal * 100).toFixed(1)}%)`, inline: true },
        { name: '📈 Predicted Memory', value: `${predicted.toFixed(1)}%`, inline: true },
        { name: '⏱️ Uptime', value: `${(process.uptime() / 3600).toFixed(1)} hours`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Optimization AI v10.1' });

    await this._sendWebhookMessage(
      embed,
      this.reportWebhookUrl,
      this.reportWebhookUsername,
      this.reportWebhookAvatar,
      this.reportChannelId
    );
    this.logger.info('📊 Performance report sent');
  }

  // ===================== API TRACKING =====================
  trackApiCall(service) {
    if (this.apiUsage[service]) {
      this.apiUsage[service].calls++;
      const percent = (this.apiUsage[service].calls / this.apiUsage[service].limit) * 100;
      if (percent > 80) {
        this._sendAlert(`⚠️ API **${service}** usage at ${percent.toFixed(1)}% (${this.apiUsage[service].calls} calls)`);
      }
    }
  }
}

module.exports = OptimizationAgent;