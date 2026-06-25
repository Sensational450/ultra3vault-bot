/**
 * 🧠 SelfImprovementAgent v12.0
 * - Advanced performance benchmarking and anomaly detection
 * - User sentiment analysis (reactions)
 * - Predictive maintenance and auto‑correction
 * - Persistent suggestion storage and impact tracking
 * - Admin dashboard commands
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
// ❌ Removed: const { z } = require('zod'); // Not used and not installed

class SelfImprovementAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Config ----
    this.feedbackChannelId = process.env.FEEDBACK_CHANNEL_ID;
    this.suggestionsChannelId = process.env.SUGGESTIONS_CHANNEL_ID || this.feedbackChannelId;
    this.reportChannelId = process.env.BOT_LOGS_CHANNEL_ID || process.env.MODLOG_CHANNEL_ID;

    // ---- Performance Metrics ----
    this.performanceHistory = [];
    this.bestMetrics = {};
    this.anomalyCache = {};

    // ---- Suggestion Storage ----
    this.suggestionLog = [];
    this.outcomeCache = {};

    // ---- Sentiment Tracking ----
    this.sentimentStats = {};

    // ---- Resource Tracking ----
    this.resourceSnapshots = [];

    // ---- Feedback Scan Tracking ----
    this.lastFeedbackScan = Date.now(); // ✅ FIXED: initialize

    // ---- Internal State ----
    this.initialized = false;
  }

  async init() {
    await super.init();
    await this._loadSuggestionsFromDB();
    await this._loadBestMetrics();
    this.initialized = true;

    // ---- Subscriptions ----
    this.subscribe('job.performanceAnalysis', async () => await this._analyzePerformance());
    this.subscribe('job.feedbackMining', async () => await this._mineFeedback());
    this.subscribe('job.trendDetection', async () => await this._detectTrends());
    this.subscribe('job.suggestionReport', async () => await this._postSuggestionReport());
    this.subscribe('job.sentimentAnalysis', async () => await this._analyzeSentiment());

    // Listen to reactions on bot messages
    this.subscribe('message.reaction', async (data) => await this._handleReaction(data));

    this.logger.info('🧠 SelfImprovementAgent v12.0 ready');
  }

  // ===================== DATABASE HELPERS =====================
  async _loadSuggestionsFromDB() {
    try {
      const rows = await this.db.all(`SELECT * FROM self_improvement_suggestions ORDER BY id DESC LIMIT 200`);
      this.suggestionLog = rows.map(r => ({
        id: r.id,
        agent: r.agent,
        suggestion: r.suggestion,
        source: r.source,
        applied: r.applied === 1,
        outcome: r.outcome,
        timestamp: r.timestamp,
      }));
      this.logger.debug(`📋 Loaded ${this.suggestionLog.length} suggestions from DB`);
    } catch (err) {
      // Table might not exist yet; create it
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS self_improvement_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent TEXT,
          suggestion TEXT,
          source TEXT,
          applied INTEGER DEFAULT 0,
          outcome TEXT,
          timestamp INTEGER
        )
      `);
    }
  }

  async _saveSuggestionToDB(suggestion) {
    try {
      const result = await this.db.run(
        `INSERT INTO self_improvement_suggestions (agent, suggestion, source, applied, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [suggestion.agent, suggestion.suggestion, suggestion.source, 0, Date.now()]
      );
      suggestion.id = result.lastID;
      this.suggestionLog.push(suggestion);
    } catch (err) {
      this.logger.error(`Failed to save suggestion: ${err.message}`);
    }
  }

  async _updateSuggestionOutcome(id, outcome) {
    await this.db.run(
      `UPDATE self_improvement_suggestions SET outcome = ? WHERE id = ?`,
      [outcome, id]
    );
    const idx = this.suggestionLog.findIndex(s => s.id === id);
    if (idx !== -1) this.suggestionLog[idx].outcome = outcome;
  }

  async _loadBestMetrics() {
    try {
      const rows = await this.db.all(`SELECT * FROM performance_benchmarks`);
      for (const row of rows) {
        this.bestMetrics[row.agent] = {
          minErrors: row.minErrors,
          maxSpeed: row.maxSpeed,
          timestamp: row.timestamp,
        };
      }
    } catch (err) {
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS performance_benchmarks (
          agent TEXT PRIMARY KEY,
          minErrors INTEGER,
          maxSpeed INTEGER,
          timestamp INTEGER
        )
      `);
    }
  }

  async _updateBestMetrics(agent, errors, speed) {
    const current = this.bestMetrics[agent] || { minErrors: Infinity, maxSpeed: 0 };
    let updated = false;
    if (errors < current.minErrors) {
      current.minErrors = errors;
      updated = true;
    }
    if (speed > current.maxSpeed) {
      current.maxSpeed = speed;
      updated = true;
    }
    if (updated) {
      current.timestamp = Date.now();
      this.bestMetrics[agent] = current;
      await this.db.run(
        `INSERT OR REPLACE INTO performance_benchmarks (agent, minErrors, maxSpeed, timestamp)
         VALUES (?, ?, ?, ?)`,
        [agent, current.minErrors, current.maxSpeed, current.timestamp]
      );
    }
  }

  // ===================== PERFORMANCE ANALYSIS =====================
  async _analyzePerformance() {
    const optAgent = this.deps.orchestrator?.getAgent('OptimizationAgent');
    if (!optAgent) return;

    const agentErrors = optAgent.agentErrors || new Map();
    const responseTimes = optAgent.agentResponseTimes || new Map();
    const agents = this.deps.orchestrator?.getAllAgents() || [];

    const now = Date.now();
    const analysis = { agents: [], anomalies: [] };

    for (const agent of agents) {
      const name = agent.constructor.name;
      const errors = agentErrors.get(name);
      const errorCount = errors ? errors.count : 0;
      const avgTime = responseTimes.get(name) || 0;

      this.performanceHistory.push({ timestamp: now, agent: name, errorCount, avgTime });
      if (this.performanceHistory.length > 500) this.performanceHistory.shift();

      await this._updateBestMetrics(name, errorCount, avgTime);

      const best = this.bestMetrics[name];
      if (best) {
        const errorRatio = best.minErrors > 0 ? errorCount / best.minErrors : 1;
        const speedRatio = best.maxSpeed > 0 ? avgTime / best.maxSpeed : 1;
        if (errorRatio > 1.5 || speedRatio > 1.5) {
          this.emit('selfimprovement.suggestions', {
            agent: name,
            suggestion: `Performance degraded: errors ${errorCount} (${(errorRatio-1)*100}% increase), response time ${avgTime}ms (${(speedRatio-1)*100}% increase)`,
            source: 'benchmark',
            priority: 'high',
          });
        }
      }

      const errorAnomaly = this._detectAnomaly(name, 'errors', errorCount);
      const timeAnomaly = this._detectAnomaly(name, 'time', avgTime);
      if (errorAnomaly || timeAnomaly) {
        analysis.anomalies.push({
          agent: name,
          errorAnomaly,
          timeAnomaly,
          currentError: errorCount,
          currentTime: avgTime,
        });
        this.emit('selfimprovement.suggestions', {
          agent: name,
          suggestion: `🚨 Anomaly detected: errors=${errorCount} (Z=${errorAnomaly.toFixed(2)}), response_time=${avgTime}ms (Z=${timeAnomaly.toFixed(2)})`,
          source: 'anomaly',
          priority: 'critical',
        });
      }

      const forecast = this._predictErrors(name);
      if (forecast && forecast > 10) {
        this.emit('selfimprovement.suggestions', {
          agent: name,
          suggestion: `⚠️ Predicted error count in 24h: ${forecast.toFixed(0)} (currently ${errorCount}). Consider proactive restart.`,
          source: 'predictive',
          priority: 'high',
        });
      }

      analysis.agents.push({ name, errorCount, avgTime, status: errorAnomaly ? 'anomaly' : 'healthy' });
    }

    return analysis;
  }

  // ===================== ANOMALY DETECTION =====================
  _detectAnomaly(agent, metric, value) {
    const history = this.performanceHistory
      .filter(h => h.agent === agent)
      .slice(-30)
      .map(h => metric === 'errors' ? h.errorCount : h.avgTime);

    if (history.length < 15) return 0;

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const std = Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length);
    if (std === 0) return 0;
    const z = (value - mean) / std;
    return z > 3 ? z : 0;
  }

  // ===================== PREDICTIVE MAINTENANCE =====================
  _predictErrors(agent) {
    const history = this.performanceHistory
      .filter(h => h.agent === agent)
      .slice(-20)
      .map(h => ({ x: h.timestamp, y: h.errorCount }));

    if (history.length < 10) return null;

    const x = history.map(h => h.x);
    const y = history.map(h => h.y);
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const futureX = Date.now() + 24 * 60 * 60 * 1000;
    const predicted = slope * futureX + intercept;
    return predicted > 0 ? predicted : 0;
  }

  // ===================== USER SENTIMENT ANALYSIS =====================
  async _analyzeSentiment() {
    let totalPos = 0, totalNeg = 0;
    for (const [agent, stats] of Object.entries(this.sentimentStats)) {
      totalPos += stats.positive;
      totalNeg += stats.negative;
    }
    if (totalPos + totalNeg === 0) return;

    const ratio = totalPos / (totalPos + totalNeg);
    if (ratio < 0.4) {
      this.emit('selfimprovement.suggestions', {
        agent: 'General',
        suggestion: `User sentiment is low (${(ratio * 100).toFixed(0)}% positive). Consider reviewing bot responses or adjusting tone.`,
        source: 'sentiment',
        priority: 'medium',
      });
    }
  }

  async _handleReaction(data) {
    const { message, emoji, userId, added } = data;
    if (!message.author?.bot) return;
    if (userId === this.client.user.id) return;

    const agent = 'General';

    if (!this.sentimentStats[agent]) this.sentimentStats[agent] = { positive: 0, negative: 0 };
    const isPositive = ['👍', '✅', '❤️', '🎉', '🚀', '💎'].includes(emoji.name);
    const isNegative = ['👎', '❌', '😡', '💩', '👀'].includes(emoji.name);
    if (isPositive) this.sentimentStats[agent].positive += added ? 1 : -1;
    if (isNegative) this.sentimentStats[agent].negative += added ? 1 : -1;
  }

  // ===================== FEEDBACK MINING =====================
  async _mineFeedback() {
    if (!this.feedbackChannelId) return;
    const channel = this.client.channels.cache.get(this.feedbackChannelId);
    if (!channel?.isTextBased()) return;

    const messages = await channel.messages.fetch({ limit: 100, after: this.lastFeedbackScan });
    if (messages.size === 0) return;

    this.lastFeedbackScan = Date.now();

    const useAI = !!process.env.OPENAI_API_KEY;
    let openai;
    if (useAI) {
      openai = new (require('openai')).OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    for (const [id, msg] of messages) {
      if (msg.author.bot) continue;
      const content = msg.content;
      const keywords = ['suggest', 'improve', 'add', 'fix', 'change', 'slow', 'bug', 'idea', 'should', 'need'];
      if (!keywords.some(kw => content.toLowerCase().includes(kw))) continue;

      let suggestion = null;
      if (useAI) {
        try {
          const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Extract a single, concise improvement suggestion from the user message. Return only the suggestion, no extra text.' },
              { role: 'user', content: content }
            ],
            max_tokens: 60,
            temperature: 0.3,
          });
          suggestion = response.choices[0].message.content.trim();
        } catch (err) {
          this.logger.debug(`AI feedback mining failed: ${err.message}`);
        }
      }
      if (!suggestion) {
        const lines = content.split(/[.!?]\s/);
        const likely = lines.find(l => keywords.some(k => l.toLowerCase().includes(k)));
        suggestion = likely || content.substring(0, 120);
      }

      if (suggestion) {
        const suggestionObj = {
          agent: 'General',
          suggestion: `From user ${msg.author.tag}: ${suggestion}`,
          source: 'feedback',
          priority: 'medium',
        };
        await this._saveSuggestionToDB(suggestionObj);
        this.emit('selfimprovement.suggestions', suggestionObj);
      }
    }
  }

  // ===================== TREND DETECTION =====================
  async _detectTrends() {
    const optAgent = this.deps.orchestrator?.getAgent('OptimizationAgent');
    if (!optAgent) return;

    const memUsage = process.memoryUsage().heapUsed / (1024 * 1024);
    this.resourceSnapshots.push({ timestamp: Date.now(), memUsage });
    if (this.resourceSnapshots.length > 100) this.resourceSnapshots.shift();

    if (this.resourceSnapshots.length > 10) {
      const last10 = this.resourceSnapshots.slice(-10);
      const first = last10[0].memUsage;
      const last = last10[last10.length - 1].memUsage;
      if (last > first * 1.3) {
        this.emit('selfimprovement.suggestions', {
          agent: 'System',
          suggestion: `Memory usage increased ${((last - first) / first * 100).toFixed(1)}% over last ${last10.length} checks. Consider scaling or restarting.`,
          source: 'resource',
          priority: 'medium',
        });
      }
    }
  }

  // ===================== SUGGESTION REPORT =====================
  async _postSuggestionReport() {
    const channelId = this.reportChannelId;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

    const pending = this.suggestionLog.filter(s => !s.applied).slice(-10);
    const applied = this.suggestionLog.filter(s => s.applied).slice(-5);

    const embed = new EmbedBuilder()
      .setTitle('🧠 Weekly Self‑Improvement Report')
      .setColor(0x00ff88)
      .setDescription(`📅 **${new Date().toLocaleDateString()}**`)
      .addFields(
        { name: '📊 Pending Suggestions', value: pending.length.toString(), inline: true },
        { name: '✅ Applied This Week', value: applied.length.toString(), inline: true },
        { name: '📈 Total Suggestions', value: this.suggestionLog.length.toString(), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Self-Improvement AI v12.0' });

    if (pending.length > 0) {
      const top = pending.slice(0, 5);
      for (const s of top) {
        embed.addFields({
          name: `🔹 ${s.agent || 'General'}`,
          value: `${s.suggestion.substring(0, 100)}${s.suggestion.length > 100 ? '...' : ''}\n_${s.source}_`,
          inline: false,
        });
      }
    }

    await channel.send({ embeds: [embed] });
  }

  // ===================== ADMIN COMMANDS =====================
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'suggestions':
        await this.cmdSuggestions(interaction);
        break;
      case 'apply':
        await this.cmdApply(interaction);
        break;
      case 'performance':
        await this.cmdPerformance(interaction);
        break;
      case 'predict':
        await this.cmdPredict(interaction);
        break;
      case 'metrics':
        await this.cmdMetrics(interaction);
        break;
      case 'applysuggestion':
        await this.cmdApply(interaction);
        break;
    }
  }

  async cmdSuggestions(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const pending = this.suggestionLog.filter(s => !s.applied).slice(0, 10);
    if (pending.length === 0) {
      return interaction.reply({ content: '📋 No pending suggestions.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Pending Improvements')
      .setColor(0x3498db)
      .setDescription(pending.map((s, i) => 
        `**${i+1}.** ${s.agent || 'General'}: ${s.suggestion}\n_(${s.source})_`
      ).join('\n\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdApply(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const pending = this.suggestionLog.filter(s => !s.applied);
    if (pending.length === 0) {
      return interaction.reply({ content: '📋 No pending suggestions to apply.', ephemeral: true });
    }

    const suggestion = pending[0];
    suggestion.applied = true;
    await this.db.run(
      `UPDATE self_improvement_suggestions SET applied = 1 WHERE id = ?`,
      [suggestion.id]
    );

    await this._updateSuggestionOutcome(suggestion.id, 'applied');

    await interaction.reply({
      content: `✅ Applied: ${suggestion.suggestion}\n\nWe'll track its impact automatically.`,
      ephemeral: true
    });
  }

  async cmdPerformance(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const analysis = await this._analyzePerformance();
    const agents = analysis.agents;
    const anomalies = analysis.anomalies;

    let summary = agents.map(a => 
      `${a.name}: ${a.status} (errors: ${a.errorCount}, response: ${a.avgTime}ms)`
    ).join('\n');

    if (anomalies.length > 0) {
      summary += '\n\n🚨 **Anomalies Detected:**\n' + anomalies.map(a =>
        `${a.agent}: errors Z=${a.errorAnomaly?.toFixed(2) || 'N/A'}, time Z=${a.timeAnomaly?.toFixed(2) || 'N/A'}`
      ).join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Performance Analysis')
      .setDescription(summary)
      .setColor(0x00ff88)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  async cmdPredict(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const agents = this.deps.orchestrator?.getAllAgents() || [];
    let predictions = [];

    for (const agent of agents) {
      const name = agent.constructor.name;
      const forecast = this._predictErrors(name);
      if (forecast !== null) {
        predictions.push(`${name}: ${forecast.toFixed(1)} errors predicted in 24h`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🔮 Predictive Maintenance')
      .setDescription(predictions.length ? predictions.join('\n') : 'Insufficient data for predictions.')
      .setColor(0x9b59b6)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  async cmdMetrics(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const memory = process.memoryUsage();
    const uptime = process.uptime();

    const embed = new EmbedBuilder()
      .setTitle('📊 System Metrics')
      .addFields(
        { name: '💾 Memory (heap)', value: `${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(memory.heapTotal / 1024 / 1024).toFixed(1)} MB`, inline: true },
        { name: '⏱️ Uptime', value: `${(uptime / 3600).toFixed(1)} hours`, inline: true },
        { name: '📋 Suggestions', value: `${this.suggestionLog.length} total (${this.suggestionLog.filter(s => s.applied).length} applied)`, inline: true },
        { name: '📊 Sentiment', value: `Positive reactions: ${Object.values(this.sentimentStats).reduce((s, a) => s + a.positive, 0)}, Negative: ${Object.values(this.sentimentStats).reduce((s, a) => s + a.negative, 0)}`, inline: false }
      )
      .setColor(0x3498db)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = SelfImprovementAgent;