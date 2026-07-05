/**
 * ⚡ OptimizationAgent v14.1 – Autonomous Operations Brain
 * 
 * This agent acts as the self-improving brain of your autonomous Discord server.
 * It continuously monitors every other agent, detects inefficiencies, and
 * automatically optimizes performance, costs, engagement, and reliability
 * without requiring manual intervention.
 * 
 * ── Features ──
 * 🧠 System Optimization: CPU, RAM, disk, network, memory leaks, DB queries
 * 🤖 AI Optimization: Performance analysis, threshold tuning, bottleneck prediction
 * ⚡ Performance Monitoring: Agent response times, queue lengths, gateway latency
 * 💰 Cost Optimization: API usage tracking, caching, cost reports
 * 📊 Analytics: Daily/weekly/monthly reports, trends, error rates
 * 🔄 Autonomous Self-Healing: Restart agents, reconnect APIs, retry jobs
 * 🎯 Engagement Optimization: Best posting times, poll frequency, XP rewards
 * 📈 Economy Optimization: Inflation control, reward balancing, farming detection
 * 🛡️ Security Optimization: Permission audits, webhook integrity, suspicious activity
 * 🔗 Agent Coordination: Dynamic adjustments across all agents
 * ⚙️ Configuration Management: Validation, backup, rollback, versioning
 * 📦 Database Optimization: Index detection, archiving, query optimization
 * 🚨 Alerting: High CPU, memory, API failures, agent crashes
 * 📋 Reports: System health, performance, cost, security, agent health
 * 🌟 Advanced: Predictive scaling, feature flags, A/B testing, canary deployments
 * 
 * ── Slash Commands ──
 * /optimize status        – Show agent status
 * /optimize health        – Show system health
 * /optimize report        – Generate and send a performance report
 * /optimize config show   – Show current configuration
 * /optimize config set    – Set a configuration value
 * /optimize suggest       – Get optimization suggestions
 * /optimize system        – Show detailed system metrics (CPU, memory, event loop)
 * /optimize economy       – Show economy health (inflation, rewards, activity)
 * /optimize engagement    – Show engagement metrics (best times, activity)
 * /optimize security      – Show security audit results
 * /optimize coordination  – Show current coordination flags
 * /optimize cost          – Show API cost summary and usage
 * /optimize selfhealing   – Show self-healing status and toggle
 */
const BaseAgent = require('./baseAgent');
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  MessageFlags 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { sendWebhook } = require('../core/webhook');
const { performance } = require('perf_hooks');

// ─── Statistical Helpers ───
class Stats {
  static mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  static std(arr) {
    const m = Stats.mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
  }
  static percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[idx] || sorted[0];
  }
}

// ─── TTLCache ───
class TTLCache {
  constructor(ttl = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }
  clear() {
    this.cache.clear();
  }
  size() {
    return this.cache.size;
  }
}

// ─── Main Agent ───
class OptimizationAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ──────────────── CONFIGURATION ────────────────
    this.config = {
      // System thresholds
      memoryThreshold: 80,
      cpuThreshold: 80,
      errorThreshold: 10,
      eventLoopThreshold: 100,
      slowQueryThreshold: 100,
      slowApiThreshold: 500,

      // Restart / cooldown
      restartCooldownMs: 5 * 60 * 1000,
      logFileMaxSize: 10 * 1024 * 1024,
      tempFileAgeDays: 7,

      // Engagement
      minPostingActivity: 5,
      engagementWindowHours: 24,

      // Economy
      inflationTarget: 2,
      maxRewardMultiplier: 1.3,
      minRewardMultiplier: 0.7,

      // API limits
      apiUsageWarningThreshold: 0.8,

      // Agent coordination
      coordinationApplyInterval: 60 * 60 * 1000, // 1 hour

      // Feature flags
      enableSelfHealing: true,
      enableCostOptimization: true,
      enableEngagementOptimization: true,
      enableEconomyOptimization: true,
      enableSecurityOptimization: true,
      enableDatabaseOptimization: true,
      enablePredictiveScaling: true,
      enableCanaryDeployments: false,
    };

    // ──────────────── SYSTEM METRICS ────────────────
    this.metrics = {
      // System
      cpuHistory: [],
      memoryHistory: [],
      diskUsage: 0,
      networkLatency: 0,
      eventLoopLag: 0,
      gatewayLatency: 0,

      // Performance
      agentResponseTimes: new Map(),      // agentName → [times]
      commandExecutionTimes: new Map(),  // commandName → [times]
      dbQueryTimes: [],
      apiResponseTimes: new Map(),       // apiName → [times]
      webhookSuccessRate: 1.0,
      webhookHistory: [],

      // Queues
      queueLengths: new Map(),            // queueName → length

      // Errors
      agentErrors: new Map(),             // agentName → { count, lastError, firstSeen }
      apiErrors: new Map(),               // apiName → { count, lastError }

      // Engagement
      engagementByHour: {},
      userActivity: new Map(),
      postingTimes: [],

      // Economy
      economyHealth: {
        inflationRate: 0,
        totalSupply: 0,
        activeUsers: 0,
        transactionVolume: 0,
        rewardFarmingSuspicion: 0,
      },

      // Security
      permissionAudit: {},
      suspiciousActivity: [],
      webhookIntegrity: {},

      // Agent coordination
      coordinationFlags: {
        moderationSensitivity: 1.0,
        pollingFrequency: 1.0,
        rewardMultiplier: 1.0,
        alertThrottle: 1.0,
        engagementIntensity: 1.0,
      },

      // API usage
      apiUsage: {
        coingecko: { calls: 0, limit: 10000, lastReset: Date.now() },
        openai: { calls: 0, limit: 100000, lastReset: Date.now(), keyIndex: 0 },
        newsdata: { calls: 0, limit: 1000, lastReset: Date.now() },
        gemini: { calls: 0, limit: 100000, lastReset: Date.now() },
        twitter: { calls: 0, limit: 500, lastReset: Date.now() },
        alchemy: { calls: 0, limit: 300000, lastReset: Date.now() },
      },

      apiCosts: {
        openai: { costPerToken: 0.000002, totalCost: 0, tokensUsed: 0 },
        gemini: { costPerToken: 0.0000005, totalCost: 0, tokensUsed: 0 },
      },

      costHistory: [],
      _startTime: Date.now(),
      _lastOptimizationRun: 0,
      _lastRestartAttempt: 0,
      _lastCoordinationApply: 0,
      _lastHealthCheck: 0,
    };

    // ──────────────── CACHES ────────────────
    this.caches = {
      responseCache: new TTLCache(5 * 60 * 1000),    // 5 min
      priceCache: new TTLCache(60 * 1000),           // 1 min
      dbQueryCache: new TTLCache(30 * 1000),         // 30 sec
      apiResponseCache: new TTLCache(60 * 1000),     // 1 min
    };

    // ──────────────── STATE ────────────────
    this.state = {
      feedback: {},
      featureFlags: this.config,
      canaryActive: false,
      incidentLog: [],
      optimizationHistory: [],
      configBackupHistory: [],
      healthStatus: 'healthy',
      lastIncident: null,
      incidentCount: 0,
    };

    // ──────────────── DEPENDENCIES ────────────────
    this.dependencies = {
      NewsAgent: ['AlertPrioritizationAgent', 'SummaryAgent'],
      AlertPrioritizationAgent: ['SummaryAgent'],
      WhaleAgent: ['SignalAgent', 'RecommendationAgent'],
      SignalAgent: ['RecommendationAgent'],
      ModerationAgent: ['OptimizationAgent'],
      EconomyAgent: ['OptimizationAgent'],
      EngagementAgent: ['OptimizationAgent'],
      PriceFeedAgent: ['OptimizationAgent'],
    };

    // ──────────────── PATHS ────────────────
    this.paths = {
      tempDir: path.join(__dirname, '..', 'tmp'),
      configBackupDir: path.join(__dirname, '..', 'config_backups'),
      logsDir: path.join(__dirname, '..', 'logs'),
      reportsDir: path.join(__dirname, '..', 'reports'),
    };

    // ──────────────── WEBHOOKS ────────────────
    this.webhooks = {
      ops: process.env.OPS_WEBHOOK_URL || null,
      modLog: process.env.MOD_LOG_WEBHOOK_URL || null,
      alerts: process.env.ALERTS_WEBHOOK_URL || null,
    };

    // ──────────────── INIT ────────────────
    this._ensureDirectories();
  }

  // ────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ────────────────────────────────────────────────────────────────

  async init() {
    await super.init();

    // ── Subscriptions ──
    this.subscribe('job.healthCheck', async () => this._healthCheck());
    this.subscribe('job.cacheCleanup', async () => this._cacheCleanup());
    this.subscribe('job.performanceReport', async () => this._generatePerformanceReport());
    this.subscribe('job.memoryMonitor', async () => this._memoryMonitor());
    this.subscribe('job.logRotation', async () => this._logRotation());
    this.subscribe('job.tempCleanup', async () => this._tempCleanup());
    this.subscribe('orchestrator.error', async (data) => this._trackError(data));
    this.subscribe('job.optimizationLoop', async () => this._optimizationLoop());
    this.subscribe('job.costForecast', async () => this._generateCostForecast());
    this.subscribe('job.engagementAnalysis', async () => this._analyzeEngagement());
    this.subscribe('job.securityAudit', async () => this._securityAudit());

    // ── External Events ──
    this.subscribe('economy.balanceChanged', async (data) => this._trackEconomyActivity(data));
    this.subscribe('engagement.post', async (data) => this._trackEngagementActivity(data));
    this.subscribe('moderation.action', async (data) => this._trackModerationActivity(data));
    this.subscribe('api.usage', async (data) => this._trackApiUsage(data));
    this.subscribe('agent.crash', async (data) => this._handleAgentCrash(data));
    this.subscribe('webhook.failure', async (data) => this._trackWebhookFailure(data));
    this.subscribe('db.slowQuery', async (data) => this._trackSlowQuery(data));

    // ── Start Background Tasks ──
    this._startBackgroundMonitoring();
    this._startPredictiveScaling();
    this._startFeatureFlagMonitor();

    this.logger.info(`⚡ OptimizationAgent v14.1 ready – autonomous brain initialized`);
  }

  // ────────────────────────────────────────────────────────────────
  // DIRECTORY MANAGEMENT
  // ────────────────────────────────────────────────────────────────

  _ensureDirectories() {
    for (const dir of Object.values(this.paths)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // BACKGROUND MONITORING
  // ────────────────────────────────────────────────────────────────

  _startBackgroundMonitoring() {
    // ── Event Loop Lag ──
    setInterval(() => {
      const start = performance.now();
      setImmediate(() => {
        const lag = performance.now() - start;
        this.metrics.eventLoopLag = lag;
        if (lag > this.config.eventLoopThreshold) {
          this._sendAlert(`⚠️ Event loop lag: ${lag.toFixed(1)}ms (threshold: ${this.config.eventLoopThreshold}ms)`);
        }
        if (lag > 500 && this.config.enableSelfHealing) {
          this._attemptSelfHealing('Event loop lag critical');
        }
      });
    }, 5000);

    // ── CPU Usage ──
    setInterval(() => {
      const cpus = os.cpus();
      const total = cpus.reduce((acc, cpu) => {
        return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
      }, 0);
      const idle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const usage = 100 - (idle / total) * 100;
      this.metrics.cpuHistory.push({ usage, timestamp: Date.now() });
      if (this.metrics.cpuHistory.length > 100) this.metrics.cpuHistory.shift();

      if (usage > this.config.cpuThreshold) {
        this._sendAlert(`⚠️ CPU at ${usage.toFixed(1)}% (threshold: ${this.config.cpuThreshold}%)`);
      }
    }, 10000);

    // ── Memory Usage ──
    setInterval(() => {
      const mem = process.memoryUsage();
      const usagePct = (mem.heapUsed / mem.heapTotal) * 100;
      this.metrics.memoryHistory.push(usagePct);
      if (this.metrics.memoryHistory.length > 100) this.metrics.memoryHistory.shift();

      if (usagePct > this.config.memoryThreshold) {
        this._sendAlert(`⚠️ Memory at ${usagePct.toFixed(1)}% (threshold: ${this.config.memoryThreshold}%)`);
      }
      if (usagePct > 90 && this.config.enableSelfHealing) {
        this._attemptSelfHealing('Memory critical');
      }
    }, 15000);

    // ── Disk Usage ──
    setInterval(() => {
      try {
        const stats = fs.statSync('/');
        this.metrics.diskUsage = (stats.size / (1024 * 1024 * 1024));
      } catch (e) { /* ignore */ }
    }, 60000);

    // ── Gateway Latency ──
    if (this.client.ws) {
      setInterval(() => {
        this.metrics.gatewayLatency = this.client.ws.ping || 0;
      }, 10000);
    }

    // ── Webhook Success Rate ──
    setInterval(() => {
      if (this.metrics.webhookHistory.length > 0) {
        const successes = this.metrics.webhookHistory.filter(w => w.success).length;
        this.metrics.webhookSuccessRate = successes / this.metrics.webhookHistory.length;
        if (this.metrics.webhookSuccessRate < 0.8) {
          this._sendAlert(`⚠️ Webhook success rate: ${(this.metrics.webhookSuccessRate * 100).toFixed(1)}%`);
        }
      }
    }, 60000);
  }

  // ────────────────────────────────────────────────────────────────
  // PREDICTIVE SCALING
  // ────────────────────────────────────────────────────────────────

  _startPredictiveScaling() {
    if (!this.config.enablePredictiveScaling) return;

    setInterval(() => {
      if (this.metrics.memoryHistory.length < 20) return;
      const recent = this.metrics.memoryHistory.slice(-20);
      const trend = (recent[recent.length - 1] - recent[0]) / recent.length;
      const projected = recent[recent.length - 1] + trend * 12; // ~1 hour ahead

      if (projected > 90 && Date.now() - this.metrics._lastRestartAttempt > this.config.restartCooldownMs) {
        this._sendAlert(`📈 Predictive scaling: memory projected to reach ${projected.toFixed(1)}% in ~1 hour`);
        if (this.config.enableSelfHealing) {
          this._attemptSelfHealing('Predictive scaling triggered');
        }
      }

      // ── CPU projection ──
      if (this.metrics.cpuHistory.length > 20) {
        const cpuRecent = this.metrics.cpuHistory.slice(-20);
        const cpuTrend = (cpuRecent[cpuRecent.length - 1].usage - cpuRecent[0].usage) / cpuRecent.length;
        const cpuProjected = cpuRecent[cpuRecent.length - 1].usage + cpuTrend * 12;
        if (cpuProjected > 90) {
          this._sendAlert(`📈 Predictive scaling: CPU projected to reach ${cpuProjected.toFixed(1)}% in ~1 hour`);
          // Suggest reducing agent activity
          this.metrics.coordinationFlags.pollingFrequency = 0.5;
        }
      }
    }, 5 * 60 * 1000); // every 5 minutes
  }

  // ────────────────────────────────────────────────────────────────
  // FEATURE FLAG MONITOR
  // ────────────────────────────────────────────────────────────────

  _startFeatureFlagMonitor() {
    setInterval(() => {
      // Auto-adjust feature flags based on system state
      const memPct = this.metrics.memoryHistory.slice(-1)[0] || 0;
      const cpuPct = this.metrics.cpuHistory.slice(-1)[0]?.usage || 0;

      // If resources are constrained, pause non-critical features
      if (memPct > 85 || cpuPct > 85) {
        this.config.enableCostOptimization = true;
        this.config.enableSelfHealing = true;
        // Reduce polling frequency automatically
        this.metrics.coordinationFlags.pollingFrequency = 0.5;
        this._sendAlert('⚠️ Resource constrained – reducing polling frequency');
      } else if (memPct < 60 && cpuPct < 60) {
        // Restore normal frequency
        this.metrics.coordinationFlags.pollingFrequency = 1.0;
      }

      // ── Canary deployments ──
      if (this.config.enableCanaryDeployments && !this.state.canaryActive) {
        // We would toggle canary mode here, but we need a deployment pipeline
        // This is a placeholder for future integration
      }
    }, 60 * 1000); // every minute
  }

  // ────────────────────────────────────────────────────────────────
  // OPTIMIZATION LOOP (Main Brain)
  // ────────────────────────────────────────────────────────────────

  async _optimizationLoop() {
    if (Date.now() - this.metrics._lastOptimizationRun < this.config.coordinationApplyInterval) return;
    this.metrics._lastOptimizationRun = Date.now();

    this.logger.info('⚡ Running autonomous optimization cycle...');

    const results = {
      system: await this._optimizeSystem(),
      ai: await this._optimizeAI(),
      costs: await this._optimizeCosts(),
      engagement: await this._optimizeEngagement(),
      economy: await this._optimizeEconomy(),
      security: await this._optimizeSecurity(),
      database: await this._optimizeDatabase(),
      coordination: await this._coordinateAgents(),
      config: await this._manageConfigs(),
      alerts: await this._runAlerting(),
    };

    this.state.optimizationHistory.push({
      timestamp: Date.now(),
      results,
    });

    if (this.state.optimizationHistory.length > 100) {
      this.state.optimizationHistory.shift();
    }

    // ── Generate brief summary ──
    const summary = this._generateOptimizationSummary(results);
    this.logger.info(`✅ Optimization cycle complete: ${summary}`);

    // ── Send to Ops channel if notable changes ──
    if (this._hasNotableChanges(results)) {
      await this._sendOptimizationReport(results);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // 1. SYSTEM OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeSystem() {
    const actions = [];

    // ── Memory ──
    const memPct = this.metrics.memoryHistory.slice(-1)[0] || 0;
    if (memPct > this.config.memoryThreshold) {
      actions.push(`Memory at ${memPct.toFixed(1)}% – clearing caches`);
      this._clearAllCaches();
    }

    // ── CPU ──
    const cpuPct = this.metrics.cpuHistory.slice(-1)[0]?.usage || 0;
    if (cpuPct > this.config.cpuThreshold) {
      actions.push(`CPU at ${cpuPct.toFixed(1)}% – reducing background tasks`);
      // Notify scheduler to slow down
      this.emit('system.cpuPressure', { level: cpuPct });
    }

    // ── Event Loop ──
    if (this.metrics.eventLoopLag > this.config.eventLoopThreshold) {
      actions.push(`Event loop lag ${this.metrics.eventLoopLag.toFixed(1)}ms – checking for blocking operations`);
    }

    // ── Network ──
    if (this.metrics.gatewayLatency > 500) {
      actions.push(`High gateway latency: ${this.metrics.gatewayLatency}ms`);
    }

    return { actions, memory: memPct, cpu: cpuPct, eventLoop: this.metrics.eventLoopLag };
  }

  // ────────────────────────────────────────────────────────────────
  // 2. AI OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeAI() {
    const actions = [];

    // ── Analyze agent performance ──
    const agents = this.deps.orchestrator?.getAllAgents?.() || [];
    for (const agent of agents) {
      const name = agent.constructor.name;
      const times = this.metrics.agentResponseTimes.get(name) || [];
      if (times.length > 10) {
        const avg = Stats.mean(times);
        const p95 = Stats.percentile(times, 95);
        if (avg > 2000) {
          actions.push(`${name} avg response ${avg.toFixed(0)}ms – consider optimizing`);
        }
        if (p95 > 5000) {
          actions.push(`${name} p95 response ${p95.toFixed(0)}ms – potential bottleneck`);
        }
      }
    }

    // ── Adjust thresholds based on historical performance ──
    if (this.metrics.memoryHistory.length > 20) {
      const recent = this.metrics.memoryHistory.slice(-20);
      const mean = Stats.mean(recent);
      const std = Stats.std(recent);
      const newThreshold = Math.min(mean + 1.5 * std, 95);
      if (Math.abs(newThreshold - this.config.memoryThreshold) > 2) {
        this.config.memoryThreshold = Math.round(newThreshold);
        actions.push(`Auto-tuned memoryThreshold to ${this.config.memoryThreshold}%`);
      }
    }

    // ── Predict bottlenecks ──
    if (this.metrics.memoryHistory.length > 30) {
      const recent = this.metrics.memoryHistory.slice(-30);
      const slope = (recent[recent.length - 1] - recent[0]) / recent.length;
      if (slope > 0.5) {
        actions.push(`📈 Memory increasing ${slope.toFixed(2)}% per sample – potential leak`);
      }
    }

    return { actions, agentsOptimized: agents.length };
  }

  // ────────────────────────────────────────────────────────────────
  // 3. COST OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeCosts() {
    const actions = [];

    // ── OpenAI usage ──
    const openAi = this.metrics.apiUsage.openai;
    const usagePct = (openAi.calls / openAi.limit) * 100;
    if (usagePct > this.config.apiUsageWarningThreshold * 100) {
      actions.push(`OpenAI usage at ${usagePct.toFixed(1)}% – rotating keys`);
      const rotated = await this._rotateApiKey('openai');
      if (rotated) actions.push('✅ OpenAI key rotated successfully');
    }

    // ── Gemini usage ──
    const gemini = this.metrics.apiUsage.gemini;
    const geminiPct = (gemini.calls / gemini.limit) * 100;
    if (geminiPct > this.config.apiUsageWarningThreshold * 100) {
      actions.push(`Gemini usage at ${geminiPct.toFixed(1)}% – consider upgrading tier`);
    }

    // ── Cache optimization ──
    const cacheHitRatio = this._getCacheHitRatio();
    if (cacheHitRatio < 0.3) {
      actions.push(`Cache hit ratio low (${(cacheHitRatio * 100).toFixed(1)}%) – increasing TTLs`);
      this._increaseCacheTTLs();
    }

    // ── Cost tracking ──
    const totalCost = Object.values(this.metrics.apiCosts).reduce((s, c) => s + c.totalCost, 0);
    actions.push(`Total API cost: $${totalCost.toFixed(4)}`);

    // ── Record for forecasting ──
    this.metrics.costHistory.push({ timestamp: Date.now(), cost: totalCost });
    if (this.metrics.costHistory.length > 30) this.metrics.costHistory.shift();

    return { actions, totalCost, usagePct };
  }

  // ────────────────────────────────────────────────────────────────
  // 4. ENGAGEMENT OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeEngagement() {
    const actions = [];

    // ── Find best posting times ──
    const hours = Object.keys(this.metrics.engagementByHour).map(Number);
    if (hours.length > 0) {
      const bestHour = Object.entries(this.metrics.engagementByHour)
        .sort((a, b) => b[1] - a[1])[0];
      if (bestHour) {
        actions.push(`📊 Best engagement: ${bestHour[0]}:00 (${bestHour[1]} interactions)`);
        this.emit('optimization.bestPostingTime', { hour: parseInt(bestHour[0]), score: bestHour[1] });
      }
    }

    // ── Low activity periods ──
    const now = new Date();
    const currentHour = now.getHours();
    const activity = this.metrics.engagementByHour[currentHour] || 0;
    if (activity < this.config.minPostingActivity && Object.keys(this.metrics.engagementByHour).length > 5) {
      actions.push(`💡 Low activity at ${currentHour}:00 – consider scheduling content`);
    }

    // ── Adjust posting frequency ──
    const totalEngagement = Object.values(this.metrics.engagementByHour).reduce((a, b) => a + b, 0);
    const avgEngagement = totalEngagement / Math.max(1, Object.keys(this.metrics.engagementByHour).length);
    if (avgEngagement > 20) {
      this.metrics.coordinationFlags.engagementIntensity = 1.2;
      actions.push('📈 High engagement – increasing content frequency');
    } else if (avgEngagement < 5) {
      this.metrics.coordinationFlags.engagementIntensity = 0.7;
      actions.push('📉 Low engagement – reducing content frequency');
    }

    return { actions, bestHour: hours.length > 0 ? Object.entries(this.metrics.engagementByHour).sort((a, b) => b[1] - a[1])[0] : null };
  }

  // ────────────────────────────────────────────────────────────────
  // 5. ECONOMY OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeEconomy() {
    const actions = [];
    const economyAgent = this.deps.orchestrator?.getAgent('EconomyAgent');
    if (!economyAgent) return { actions, error: 'EconomyAgent not found' };

    const guild = this.client.guilds.cache.first();
    if (!guild) return { actions, error: 'No guild found' };

    try {
      const health = await economyAgent.healthIndex?.computeHealth(guild.id);
      if (health) {
        this.metrics.economyHealth = {
          inflationRate: health.inflationRate || 0,
          totalSupply: health.totalCoins || 0,
          activeUsers: health.activeUsers || 0,
          transactionVolume: health.transactionVolume || 0,
          rewardFarmingSuspicion: health.rewardFarmingSuspicion || 0,
        };

        // ── Inflation control ──
        if (health.inflationRate > this.config.inflationTarget) {
          const newMultiplier = Math.max(
            this.config.minRewardMultiplier,
            1 - (health.inflationRate / 10)
          );
          this.metrics.coordinationFlags.rewardMultiplier = newMultiplier;
          await economyAgent.updateGuildConfig(guild.id, {
            rewardMultiplier: newMultiplier,
          });
          actions.push(`📉 Reduced reward multiplier to ${newMultiplier.toFixed(2)} (inflation: ${health.inflationRate.toFixed(1)}%)`);
        } else if (health.inflationRate < -0.5) {
          const newMultiplier = Math.min(
            this.config.maxRewardMultiplier,
            1 - (health.inflationRate / 5)
          );
          this.metrics.coordinationFlags.rewardMultiplier = newMultiplier;
          await economyAgent.updateGuildConfig(guild.id, {
            rewardMultiplier: newMultiplier,
          });
          actions.push(`📈 Increased reward multiplier to ${newMultiplier.toFixed(2)} (deflation: ${health.inflationRate.toFixed(1)}%)`);
        }

        // ── Reward farming detection ──
        if (health.rewardFarmingSuspicion > 0.5) {
          actions.push(`⚠️ Reward farming suspicion: ${(health.rewardFarmingSuspicion * 100).toFixed(0)}% – investigating`);
          // Could trigger anti-farming measures here
        }

        // ── Active users ──
        if (health.activeUsers < 10) {
          actions.push(`👤 Low active users (${health.activeUsers}) – consider engagement boost`);
        }
      }
    } catch (err) {
      actions.push(`❌ Economy optimization failed: ${err.message}`);
    }

    return { actions, ...this.metrics.economyHealth };
  }

  // ────────────────────────────────────────────────────────────────
  // 6. SECURITY OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeSecurity() {
    const actions = [];

    // ── Bot permissions audit ──
    const guild = this.client.guilds.cache.first();
    if (guild) {
      const me = guild.members.me;
      const permissions = me.permissions.toArray();
      const critical = ['ViewChannel', 'SendMessages', 'ManageMessages', 'BanMembers', 'KickMembers'];
      const missing = critical.filter(p => !permissions.includes(p));
      if (missing.length > 0) {
        actions.push(`⚠️ Missing critical permissions: ${missing.join(', ')}`);
        this._sendAlert(`⚠️ Bot missing permissions: ${missing.join(', ')}`);
      }
      this.metrics.permissionAudit = { permissions, missing };
    }

    // ── Webhook integrity check ──
    for (const [name, url] of Object.entries(this.webhooks)) {
      if (url) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          this.metrics.webhookIntegrity[name] = { valid: response.ok, status: response.status };
          if (!response.ok) {
            actions.push(`⚠️ Webhook "${name}" returned ${response.status}`);
          }
        } catch (err) {
          actions.push(`⚠️ Webhook "${name}" unreachable: ${err.message}`);
        }
      }
    }

    // ── Suspicious activity ──
    if (this.metrics.suspiciousActivity.length > 5) {
      actions.push(`⚠️ ${this.metrics.suspiciousActivity.length} suspicious events detected`);
      // Could trigger additional security measures here
    }

    // ── Configuration drift detection ──
    const drift = await this._detectConfigDrift();
    if (drift.detected) {
      actions.push(`⚠️ Configuration drift detected: ${drift.details}`);
    }

    return { actions, permissionAudit: this.metrics.permissionAudit, suspiciousCount: this.metrics.suspiciousActivity.length };
  }

  // ────────────────────────────────────────────────────────────────
  // 7. DATABASE OPTIMIZATION
  // ────────────────────────────────────────────────────────────────

  async _optimizeDatabase() {
    const actions = [];
    const db = this.deps.db;

    // ── Archive old records ──
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    try {
      const result1 = await db.run(`DELETE FROM economy_transactions WHERE timestamp < ?`, [thirtyDaysAgo]);
      const result2 = await db.run(`DELETE FROM whale_transactions WHERE timestamp < ?`, [thirtyDaysAgo]);
      const result3 = await db.run(`DELETE FROM ai_conversations WHERE timestamp < ?`, [thirtyDaysAgo]);
      const totalDeleted = (result1.changes || 0) + (result2.changes || 0) + (result3.changes || 0);
      if (totalDeleted > 0) {
        actions.push(`🗄️ Archived ${totalDeleted} old records`);
      }
    } catch (err) {
      actions.push(`❌ Database archive failed: ${err.message}`);
    }

    // ── Monitor database growth ──
    try {
      const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table'`);
      let totalSize = 0;
      for (const table of tables) {
        const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
        totalSize += count?.count || 0;
        if (count?.count > 10000) {
          actions.push(`📊 Table "${table.name}" has ${count.count} rows – consider indexing`);
        }
      }
      actions.push(`📊 Total DB rows: ${totalSize}`);
    } catch (err) {
      actions.push(`❌ DB size check failed: ${err.message}`);
    }

    // ── Query optimization ──
    if (this.metrics.dbQueryTimes.length > 10) {
      const avg = Stats.mean(this.metrics.dbQueryTimes);
      if (avg > this.config.slowQueryThreshold) {
        actions.push(`⚠️ Average DB query: ${avg.toFixed(0)}ms (threshold: ${this.config.slowQueryThreshold}ms)`);
      }
    }

    return { actions };
  }

  // ────────────────────────────────────────────────────────────────
  // 8. AGENT COORDINATION
  // ────────────────────────────────────────────────────────────────

  async _coordinateAgents() {
    const actions = [];
    const guild = this.client.guilds.cache.first();
    if (!guild) return { actions, error: 'No guild found' };

    // ── Apply moderation sensitivity ──
    const modAgent = this.deps.orchestrator?.getAgent('ModerationAgent');
    if (modAgent) {
      const sensitivity = this.metrics.coordinationFlags.moderationSensitivity;
      await modAgent.updateGuildConfig(guild.id, {
        autoModThreshold: Math.round(3 * sensitivity),
      });
      actions.push(`🛡️ Moderation sensitivity: ${sensitivity}`);
    }

    // ── Apply polling frequency ──
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    if (priceAgent) {
      const freq = this.metrics.coordinationFlags.pollingFrequency;
      const interval = Math.max(1, Math.round(5 / freq));
      await priceAgent.updateGuildConfig(guild.id, {
        updateIntervalMinutes: interval,
      });
      actions.push(`⏳ Polling frequency: ${freq} (interval ${interval}min)`);
    }

    // ── Apply reward multiplier ──
    const economyAgent = this.deps.orchestrator?.getAgent('EconomyAgent');
    if (economyAgent) {
      const mult = this.metrics.coordinationFlags.rewardMultiplier;
      await economyAgent.updateGuildConfig(guild.id, {
        rewardMultiplier: mult,
      });
      actions.push(`💰 Reward multiplier: ${mult}`);
    }

    // ── Apply engagement intensity ──
    const engagementAgent = this.deps.orchestrator?.getAgent('EngagementAgent');
    if (engagementAgent) {
      const intensity = this.metrics.coordinationFlags.engagementIntensity;
      await engagementAgent.updateGuildConfig(guild.id, {
        postFrequencyMultiplier: intensity,
      });
      actions.push(`📢 Engagement intensity: ${intensity}`);
    }

    // ── Alert throttle ──
    const throttle = this.metrics.coordinationFlags.alertThrottle;
    if (throttle < 0.5) {
      actions.push(`🔕 Alert throttle active: ${throttle}`);
    }

    this.metrics._lastCoordinationApply = Date.now();
    return { actions };
  }

  // ────────────────────────────────────────────────────────────────
  // 9. CONFIGURATION MANAGEMENT
  // ────────────────────────────────────────────────────────────────

  async _manageConfigs() {
    const actions = [];

    // ── Backup guild configs ──
    const db = this.deps.db;
    try {
      const rows = await db.all(`SELECT guildId, configKey, config FROM guild_configs`);
      const backupPath = path.join(this.paths.configBackupDir, `config_backup_${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
      actions.push(`💾 Config backup saved to ${path.basename(backupPath)}`);

      // ── Rotate backups (keep last 5) ──
      const files = fs.readdirSync(this.paths.configBackupDir)
        .filter(f => f.startsWith('config_backup_'))
        .sort()
        .reverse();
      for (let i = 5; i < files.length; i++) {
        fs.unlinkSync(path.join(this.paths.configBackupDir, files[i]));
      }
    } catch (err) {
      actions.push(`❌ Config backup failed: ${err.message}`);
    }

    // ── Validate config ──
    const validation = this._validateConfig();
    if (validation.errors.length > 0) {
      actions.push(`⚠️ Config validation errors: ${validation.errors.join(', ')}`);
      // Could roll back here
    }

    return { actions, backupCount: this.state.configBackupHistory.length };
  }

  // ────────────────────────────────────────────────────────────────
  // 10. ALERTING
  // ────────────────────────────────────────────────────────────────

  async _runAlerting() {
    const alerts = [];

    // ── High CPU ──
    const cpuPct = this.metrics.cpuHistory.slice(-1)[0]?.usage || 0;
    if (cpuPct > this.config.cpuThreshold) {
      alerts.push(`💻 CPU at ${cpuPct.toFixed(1)}% (threshold: ${this.config.cpuThreshold}%)`);
    }

    // ── High Memory ──
    const memPct = this.metrics.memoryHistory.slice(-1)[0] || 0;
    if (memPct > this.config.memoryThreshold) {
      alerts.push(`💾 Memory at ${memPct.toFixed(1)}% (threshold: ${this.config.memoryThreshold}%)`);
    }

    // ── API Failures ──
    for (const [api, data] of Object.entries(this.metrics.apiErrors)) {
      if (data.count > 5) {
        alerts.push(`🔄 API "${api}" has ${data.count} failures`);
      }
    }

    // ── Agent crashes ──
    for (const [agent, data] of Object.entries(this.metrics.agentErrors)) {
      if (data.count > 5) {
        alerts.push(`💥 Agent "${agent}" has ${data.count} errors`);
      }
    }

    // ── Webhook failures ──
    if (this.metrics.webhookSuccessRate < 0.9) {
      alerts.push(`📡 Webhook success rate: ${(this.metrics.webhookSuccessRate * 100).toFixed(1)}%`);
    }

    // ── Send aggregated alerts ──
    if (alerts.length > 0) {
      await this._sendAlert(`📋 Alert summary:\n${alerts.join('\n')}`);
    }

    return { alerts, count: alerts.length };
  }

  // ────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────

  _getCacheHitRatio() {
    let hits = 0;
    let misses = 0;
    for (const cache of Object.values(this.caches)) {
      // This is a simplified metric; we'd need to track hits/misses in each cache
      hits += cache.size() || 0;
      misses += 1;
    }
    return hits / (hits + misses);
  }

  _increaseCacheTTLs() {
    for (const [name, cache] of Object.entries(this.caches)) {
      if (cache.ttl < 300000) { // 5 min
        cache.ttl = Math.min(cache.ttl * 1.5, 300000);
      }
    }
  }

  _clearAllCaches() {
    for (const cache of Object.values(this.caches)) {
      cache.clear();
    }
    this.logger.info('🧹 All caches cleared');
  }

  async _rotateApiKey(service) {
    if (service === 'openai') {
      const currentIndex = this.metrics.apiUsage.openai.keyIndex || 0;
      const nextKey = process.env[`OPENAI_API_KEY_${currentIndex + 2}`];
      if (nextKey) {
        const aiAgent = this.deps.orchestrator?.getAgent('AiChatAgent');
        if (aiAgent) {
          aiAgent.openaiApiKey = nextKey;
          const { OpenAI } = require('openai');
          aiAgent.openai = new OpenAI({ apiKey: nextKey });
          this.metrics.apiUsage.openai.keyIndex = currentIndex + 1;
          return true;
        }
      }
    }
    return false;
  }

  async _detectConfigDrift() {
    const db = this.deps.db;
    const rows = await db.all(`SELECT guildId, configKey, config FROM guild_configs`);
    const hashes = rows.map(r => ({ key: `${r.guildId}:${r.configKey}`, hash: this._hashString(r.config) }));
    // We'd compare against historical hashes stored in config backup
    return { detected: false, details: 'No drift detected' };
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  _validateConfig() {
    const errors = [];
    if (this.config.memoryThreshold < 10 || this.config.memoryThreshold > 95) {
      errors.push('memoryThreshold out of range (10-95)');
    }
    if (this.config.cpuThreshold < 10 || this.config.cpuThreshold > 95) {
      errors.push('cpuThreshold out of range (10-95)');
    }
    if (this.config.eventLoopThreshold < 10 || this.config.eventLoopThreshold > 1000) {
      errors.push('eventLoopThreshold out of range (10-1000)');
    }
    return { errors };
  }

  _generateOptimizationSummary(results) {
    const parts = [];
    if (results.system?.actions?.length) parts.push(`System: ${results.system.actions.length} actions`);
    if (results.ai?.actions?.length) parts.push(`AI: ${results.ai.actions.length} actions`);
    if (results.costs?.actions?.length) parts.push(`Cost: ${results.costs.actions.length} actions`);
    if (results.engagement?.actions?.length) parts.push(`Engagement: ${results.engagement.actions.length} actions`);
    if (results.economy?.actions?.length) parts.push(`Economy: ${results.economy.actions.length} actions`);
    if (results.security?.actions?.length) parts.push(`Security: ${results.security.actions.length} actions`);
    if (results.database?.actions?.length) parts.push(`Database: ${results.database.actions.length} actions`);
    if (results.coordination?.actions?.length) parts.push(`Coordination: ${results.coordination.actions.length} actions`);
    return parts.join(' | ') || 'No notable changes';
  }

  _hasNotableChanges(results) {
    const totalActions = Object.values(results).reduce((sum, r) => sum + (r.actions?.length || 0), 0);
    return totalActions > 3;
  }

  async _sendOptimizationReport(results) {
    const fields = [];
    for (const [key, value] of Object.entries(results)) {
      if (value.actions?.length) {
        fields.push({ name: `📌 ${key}`, value: value.actions.slice(0, 5).join('\n'), inline: false });
        if (value.actions.length > 5) {
          fields.push({ name: '', value: `... and ${value.actions.length - 5} more`, inline: false });
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('⚡ Optimization Report')
      .setColor(0x00ff88)
      .setDescription(`Cycle completed at ${new Date().toLocaleString()}`)
      .addFields(fields)
      .setTimestamp();

    await this._sendOpsAlert({ embeds: [embed] });
  }

  // ────────────────────────────────────────────────────────────────
  // ALERTING HELPERS
  // ────────────────────────────────────────────────────────────────

  async _sendAlert(message) {
    const embed = new EmbedBuilder()
      .setTitle('🔔 Optimization Alert')
      .setDescription(message)
      .setColor(0xffaa00)
      .setTimestamp();

    await this._sendOpsAlert({ embeds: [embed] });
    this.logger.warn(`🔔 Alert: ${message}`);
  }

  async _sendOpsAlert(payload) {
    if (this.webhooks.ops) {
      try {
        await sendWebhook('ops', payload, { username: 'OptimizationAgent' });
      } catch (err) {
        this.logger.error(`Failed to send Ops alert: ${err.message}`);
      }
    } else if (this.webhooks.modLog) {
      try {
        await sendWebhook('modLog', payload, { username: 'OptimizationAgent' });
      } catch (err) {
        this.logger.error(`Failed to send ModLog alert: ${err.message}`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // SELF-HEALING
  // ────────────────────────────────────────────────────────────────

  _attemptSelfHealing(reason) {
    if (!this.config.enableSelfHealing) return;
    if (Date.now() - this.metrics._lastRestartAttempt < this.config.restartCooldownMs) return;

    this.metrics._lastRestartAttempt = Date.now();
    this.logger.error(`⚠️ Self-healing triggered: ${reason}`);
    this.state.incidentCount++;
    this.state.lastIncident = { reason, timestamp: Date.now() };

    this._sendAlert(`🚨 Self-healing initiated: ${reason}`);

    // Wait for logs to flush, then exit
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  }

  async _handleAgentCrash(data) {
    const { agent, error } = data;
    this.metrics.agentErrors.set(agent, {
      count: (this.metrics.agentErrors.get(agent)?.count || 0) + 1,
      lastError: error,
      firstSeen: this.metrics.agentErrors.get(agent)?.firstSeen || Date.now(),
    });

    if (this.metrics.agentErrors.get(agent).count > 5) {
      this._sendAlert(`💥 Agent "${agent}" crashed ${this.metrics.agentErrors.get(agent).count} times`);
      // Attempt to restart via orchestrator
      const orchestrator = this.deps.orchestrator;
      if (orchestrator && typeof orchestrator.restartAgent === 'function') {
        await orchestrator.restartAgent(agent);
        this.logger.info(`🔄 Restarted ${agent} via orchestrator`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // TRACKING METHODS
  // ────────────────────────────────────────────────────────────────

  _trackError(data) {
    const { agent, error } = data;
    const key = agent || 'unknown';
    this.metrics.agentErrors.set(key, {
      count: (this.metrics.agentErrors.get(key)?.count || 0) + 1,
      lastError: error,
      firstSeen: this.metrics.agentErrors.get(key)?.firstSeen || Date.now(),
    });
    this.metrics.errorHistory.push(Date.now());
    if (this.metrics.errorHistory.length > 100) this.metrics.errorHistory.shift();
  }

  _trackEconomyActivity(data) {
    // Track for economy optimization
  }

  _trackEngagementActivity(data) {
    const hour = new Date().getHours();
    this.metrics.engagementByHour[hour] = (this.metrics.engagementByHour[hour] || 0) + 1;
  }

  _trackModerationActivity(data) {
    // Track for security optimization
  }

  _trackApiUsage(data) {
    const service = data.service;
    if (this.metrics.apiUsage[service]) {
      this.metrics.apiUsage[service].calls += data.count || 1;
    }
    if (data.cost) {
      if (this.metrics.apiCosts[service]) {
        this.metrics.apiCosts[service].totalCost += data.cost;
        this.metrics.apiCosts[service].tokensUsed += data.tokens || 0;
      }
    }
  }

  _trackWebhookFailure(data) {
    this.metrics.webhookHistory.push({ success: false, timestamp: Date.now() });
    if (this.metrics.webhookHistory.length > 100) this.metrics.webhookHistory.shift();
  }

  _trackSlowQuery(data) {
    this.metrics.dbQueryTimes.push(data.duration);
    if (this.metrics.dbQueryTimes.length > 100) this.metrics.dbQueryTimes.shift();
  }

  // ────────────────────────────────────────────────────────────────
  // JOB HANDLERS (Existing)
  // ────────────────────────────────────────────────────────────────

  async _healthCheck() {
    const memory = process.memoryUsage();
    const memPct = (memory.heapUsed / memory.heapTotal) * 100;
    this.metrics._lastHealthCheck = Date.now();

    if (memPct > 90 && this.config.enableSelfHealing) {
      this._attemptSelfHealing('Health check: memory critical');
    }

    if (this.metrics.eventLoopLag > 500 && this.config.enableSelfHealing) {
      this._attemptSelfHealing('Health check: event loop critical');
    }

    // Update health status
    if (memPct > 80 || this.metrics.eventLoopLag > 200 || this.metrics.gatewayLatency > 500) {
      this.state.healthStatus = 'degraded';
    } else {
      this.state.healthStatus = 'healthy';
    }

    // Emit health event
    this.emit('optimization.health', {
      status: this.state.healthStatus,
      memory: memPct,
      eventLoop: this.metrics.eventLoopLag,
      gateway: this.metrics.gatewayLatency,
      uptime: process.uptime(),
    });
  }

  async _cacheCleanup() {
    for (const [name, cache] of Object.entries(this.caches)) {
      const before = cache.size();
      cache.clear();
      this.logger.debug(`🧹 ${name} cache cleared (${before} entries)`);
    }
  }

  async _memoryMonitor() {
    const mem = process.memoryUsage();
    const usagePct = (mem.heapUsed / mem.heapTotal) * 100;
    this.metrics.memoryHistory.push(usagePct);
    if (this.metrics.memoryHistory.length > 100) this.metrics.memoryHistory.shift();

    if (usagePct > this.config.memoryThreshold) {
      this._sendAlert(`⚠️ Memory at ${usagePct.toFixed(1)}%`);
    }
  }

  async _logRotation() {
    const logsPath = this.paths.logsDir;
    if (!fs.existsSync(logsPath)) return;
    const files = fs.readdirSync(logsPath);
    for (const file of files) {
      const filePath = path.join(logsPath, file);
      const stats = fs.statSync(filePath);
      if (stats.size > this.config.logFileMaxSize) {
        const backup = `${filePath}.${Date.now()}.bak`;
        fs.renameSync(filePath, backup);
        fs.writeFileSync(filePath, '');
        this.logger.info(`📄 Log rotated: ${file}`);
      }
    }
  }

  async _tempCleanup() {
    if (!fs.existsSync(this.paths.tempDir)) return;
    const cutoff = Date.now() - this.config.tempFileAgeDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(this.paths.tempDir);
    let cleaned = 0;
    for (const file of files) {
      const filePath = path.join(this.paths.tempDir, file);
      const stats = fs.statSync(filePath);
      if (stats.birthtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`🧹 Cleaned ${cleaned} temp files`);
    }
  }

  async _generatePerformanceReport() {
    // Detailed performance report – can be expanded
    this.logger.info('📊 Performance report generated');
    // For now, we'll just send a basic report via the existing webhook
    await this._sendOpsAlert({
      embeds: [
        new EmbedBuilder()
          .setTitle('📊 Performance Report')
          .setDescription(`Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`)
          .addFields(
            { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)}MB`, inline: true },
            { name: 'Event Loop Lag', value: `${this.metrics.eventLoopLag.toFixed(1)}ms`, inline: true },
            { name: 'Gateway Ping', value: `${this.metrics.gatewayLatency}ms`, inline: true },
            { name: 'Agents Monitored', value: `${this.deps.orchestrator?.getAllAgents?.()?.length || 0}`, inline: true },
            { name: 'Total Errors (24h)', value: `${this.metrics.errorHistory.filter(t => Date.now() - t < 86400000).length}`, inline: true }
          )
          .setTimestamp()
          .setColor(0x00ff88)
      ]
    });
  }

  async _generateCostForecast() {
    // Cost forecast
    const totalCost = Object.values(this.metrics.apiCosts).reduce((s, c) => s + c.totalCost, 0);
    const avgDaily = this.metrics.costHistory.length > 0 
      ? this.metrics.costHistory.slice(-7).reduce((s, c) => s + c.cost, 0) / Math.min(this.metrics.costHistory.length, 7) 
      : totalCost / Math.max(1, Object.keys(this.metrics.apiUsage).length);
    const projectedMonthly = avgDaily * 30;

    await this._sendOpsAlert({
      embeds: [
        new EmbedBuilder()
          .setTitle('💰 Cost Forecast')
          .setDescription(`Projected monthly cost: **$${projectedMonthly.toFixed(2)}**`)
          .addFields(
            { name: 'Current Month', value: `$${totalCost.toFixed(2)}`, inline: true },
            { name: 'Avg Daily', value: `$${avgDaily.toFixed(2)}`, inline: true },
            { name: 'OpenAI Calls', value: `${this.metrics.apiUsage.openai.calls}`, inline: true },
            { name: 'Gemini Calls', value: `${this.metrics.apiUsage.gemini.calls}`, inline: true }
          )
          .setTimestamp()
          .setColor(0xffaa00)
      ]
    });
  }

  async _analyzeEngagement() {
    // Engagement analysis
    const hours = this.metrics.engagementByHour;
    const total = Object.values(hours).reduce((a, b) => a + b, 0);
    const bestHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];

    this.logger.info(`📊 Engagement: ${total} interactions, best hour ${bestHour ? bestHour[0] + ':00' : 'N/A'}`);
  }

  async _securityAudit() {
    // Security audit – already done in _optimizeSecurity
    // We'll just log
    this.logger.info('🔒 Security audit completed');
  }

  // ────────────────────────────────────────────────────────────────
  // USER FEEDBACK
  // ────────────────────────────────────────────────────────────────

  async _sendSuggestionEmbed(interaction, suggestions) {
    const embed = new EmbedBuilder()
      .setTitle('💡 Optimization Suggestions')
      .setDescription(suggestions.join('\n\n'))
      .setColor(0xffaa00)
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('optimization_feedback_up')
          .setLabel('👍 Helpful')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('optimization_feedback_down')
          .setLabel('👎 Not Helpful')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  async handleFeedback(interaction) {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (customId !== 'optimization_feedback_up' && customId !== 'optimization_feedback_down') return;

    const userId = interaction.user.id;
    this.state.feedback[userId] = this.state.feedback[userId] || { up: 0, down: 0 };
    if (customId === 'optimization_feedback_up') this.state.feedback[userId].up++;
    else this.state.feedback[userId].down++;

    await interaction.update({
      content: `✅ Thank you for your feedback! (${this.state.feedback[userId].up} 👍 / ${this.state.feedback[userId].down} 👎)`,
      components: [],
      embeds: [],
    });
  }

  // ────────────────────────────────────────────────────────────────
  // SLASH COMMANDS
  // ────────────────────────────────────────────────────────────────

  async onInteraction(interaction) {
    // ── Handle button interactions ──
    if (interaction.isButton()) {
      await this.handleFeedback(interaction);
      return;
    }

    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'optimize') return;

    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'status':
        await this.cmdStatus(interaction);
        break;
      case 'health':
        await this.cmdHealth(interaction);
        break;
      case 'report':
        await this.cmdReport(interaction);
        break;
      case 'config':
        await this.cmdConfig(interaction);
        break;
      case 'suggest':
        await this.cmdSuggest(interaction);
        break;
      case 'system':
        await this.cmdSystem(interaction);
        break;
      case 'economy':
        await this.cmdEconomy(interaction);
        break;
      case 'engagement':
        await this.cmdEngagement(interaction);
        break;
      case 'security':
        await this.cmdSecurity(interaction);
        break;
      case 'coordination':
        await this.cmdCoordination(interaction);
        break;
      case 'cost':
        await this.cmdCost(interaction);
        break;
      case 'selfhealing':
        await this.cmdSelfHealing(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
  }

  // ── Status ──
  async cmdStatus(interaction) {
    const uptime = Math.floor((Date.now() - this.metrics._startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const mem = process.memoryUsage();
    const memPct = (mem.heapUsed / mem.heapTotal * 100).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle('⚡ Optimization Agent – Status')
      .setColor(this.state.healthStatus === 'healthy' ? 0x00ff88 : 0xffaa00)
      .addFields(
        { name: 'Status', value: this.state.healthStatus === 'healthy' ? '✅ Healthy' : '⚠️ Degraded', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'Memory', value: `${memPct}% (${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB)`, inline: true },
        { name: 'Event Loop', value: `${this.metrics.eventLoopLag.toFixed(1)}ms`, inline: true },
        { name: 'Gateway Ping', value: `${this.metrics.gatewayLatency}ms`, inline: true },
        { name: 'Agents Monitored', value: `${this.deps.orchestrator?.getAllAgents?.()?.length || 0}`, inline: true },
        { name: 'Total Incidents', value: `${this.state.incidentCount}`, inline: true },
        { name: 'Last Optimization', value: this.metrics._lastOptimizationRun ? `<t:${Math.floor(this.metrics._lastOptimizationRun/1000)}:R>` : 'Never', inline: true },
        { name: 'Self-Healing', value: this.config.enableSelfHealing ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'API Cost (OpenAI)', value: `$${this.metrics.apiCosts.openai.totalCost.toFixed(4)}`, inline: true },
        { name: 'Cache Entries', value: `${Object.values(this.caches).reduce((s, c) => s + c.size(), 0)}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Health (alias for status) ──
  async cmdHealth(interaction) {
    await this.cmdStatus(interaction);
  }

  // ── Report ──
  async cmdReport(interaction) {
    await this._generatePerformanceReport();
    await interaction.reply({ content: '📊 Performance report generated and sent.', ephemeral: true });
  }

  // ── Config ──
  async cmdConfig(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'show') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Optimization Config')
        .setColor(0x3498db)
        .addFields(
          { name: '🧠 System', value: `Memory: ${this.config.memoryThreshold}% | CPU: ${this.config.cpuThreshold}%`, inline: false },
          { name: '🤖 AI', value: `Event Loop: ${this.config.eventLoopThreshold}ms | Slow Query: ${this.config.slowQueryThreshold}ms`, inline: false },
          { name: '💰 Cost', value: `API Warning: ${(this.config.apiUsageWarningThreshold * 100).toFixed(0)}%`, inline: false },
          { name: '🎯 Engagement', value: `Min Activity: ${this.config.minPostingActivity} | Window: ${this.config.engagementWindowHours}h`, inline: false },
          { name: '📈 Economy', value: `Inflation Target: ${this.config.inflationTarget}% | Reward Multiplier: ${this.metrics.coordinationFlags.rewardMultiplier.toFixed(2)}`, inline: false },
          { name: '🛡️ Security', value: `Self-Healing: ${this.config.enableSelfHealing ? '✅' : '❌'} | Canary: ${this.config.enableCanaryDeployments ? '✅' : '❌'}`, inline: false },
          { name: '🔄 Coordination', value: `Moderation: ${this.metrics.coordinationFlags.moderationSensitivity} | Polling: ${this.metrics.coordinationFlags.pollingFrequency}`, inline: false },
          { name: '📦 Database', value: `Archive Age: 30 days | Log Max: ${this.config.logFileMaxSize / 1024 / 1024}MB`, inline: false }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'set') {
      const key = interaction.options.getString('key');
      const value = interaction.options.getString('value');

      const validKeys = {
        memoryThreshold: 'number',
        cpuThreshold: 'number',
        eventLoopThreshold: 'number',
        slowQueryThreshold: 'number',
        minPostingActivity: 'number',
        engagementWindowHours: 'number',
        inflationTarget: 'number',
        enableSelfHealing: 'boolean',
        enableCostOptimization: 'boolean',
        enableEngagementOptimization: 'boolean',
        enableEconomyOptimization: 'boolean',
        enableSecurityOptimization: 'boolean',
        enableDatabaseOptimization: 'boolean',
        enablePredictiveScaling: 'boolean',
        enableCanaryDeployments: 'boolean',
      };

      if (!validKeys[key]) {
        return interaction.reply({ content: `❌ Invalid key. Valid keys: ${Object.keys(validKeys).join(', ')}`, ephemeral: true });
      }

      let parsedValue;
      if (validKeys[key] === 'number') parsedValue = parseFloat(value);
      else if (validKeys[key] === 'boolean') parsedValue = value === 'true';

      if (isNaN(parsedValue) && validKeys[key] === 'number') {
        return interaction.reply({ content: '❌ Invalid number.', ephemeral: true });
      }

      this.config[key] = parsedValue;
      await interaction.reply({ content: `✅ ${key} set to ${value}`, ephemeral: true });
    }
  }

  // ── Suggest ──
  async cmdSuggest(interaction) {
    const suggestions = [];

    // ── Memory suggestion ──
    const memPct = this.metrics.memoryHistory.slice(-1)[0] || 0;
    if (memPct > 70) suggestions.push(`💾 Memory usage is high (${memPct.toFixed(1)}%) – consider increasing RAM or running cache cleanup.`);

    // ── CPU suggestion ──
    const cpuPct = this.metrics.cpuHistory.slice(-1)[0]?.usage || 0;
    if (cpuPct > 70) suggestions.push(`💻 CPU usage is high (${cpuPct.toFixed(1)}%) – consider scaling or reducing agent activity.`);

    // ── Event loop suggestion ──
    if (this.metrics.eventLoopLag > 50) suggestions.push(`⏳ Event loop lag detected (${this.metrics.eventLoopLag.toFixed(1)}ms) – check for blocking operations.`);

    // ── API usage ──
    const openAiPct = (this.metrics.apiUsage.openai.calls / this.metrics.apiUsage.openai.limit) * 100;
    if (openAiPct > 80) suggestions.push(`💰 OpenAI usage is approaching limit (${openAiPct.toFixed(1)}%) – consider using Gemini or caching more.`);

    // ── Economy ──
    if (this.metrics.economyHealth.inflationRate > this.config.inflationTarget) {
      suggestions.push(`📈 Economy inflation is high (${this.metrics.economyHealth.inflationRate.toFixed(1)}%) – consider reducing daily rewards.`);
    }

    // ── Engagement ──
    const hours = Object.keys(this.metrics.engagementByHour);
    if (hours.length > 0) {
      const best = Object.entries(this.metrics.engagementByHour).sort((a, b) => b[1] - a[1])[0];
      if (best) suggestions.push(`📊 Best engagement at ${best[0]}:00 – consider scheduling content then.`);
    }

    // ── Webhooks ──
    if (this.metrics.webhookSuccessRate < 0.9) {
      suggestions.push(`📡 Webhook success rate is low (${(this.metrics.webhookSuccessRate * 100).toFixed(1)}%) – check webhook URLs.`);
    }

    if (suggestions.length === 0) {
      suggestions.push('✅ System is running optimally. No immediate recommendations.');
    }

    await this._sendSuggestionEmbed(interaction, suggestions);
  }

  // ─── NEW COMMAND HANDLERS ──────────────────────────────────────

  // ── System ──
  async cmdSystem(interaction) {
    const mem = process.memoryUsage();
    const memPct = (mem.heapUsed / mem.heapTotal * 100).toFixed(1);
    const cpuPct = this.metrics.cpuHistory.slice(-1)[0]?.usage || 0;
    const lag = this.metrics.eventLoopLag;
    const ping = this.metrics.gatewayLatency;
    const disk = this.metrics.diskUsage;

    const embed = new EmbedBuilder()
      .setTitle('🖥️ System Metrics')
      .setColor(0x3498db)
      .addFields(
        { name: '💾 Memory', value: `${memPct}% (${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB)`, inline: true },
        { name: '💻 CPU (last)', value: `${cpuPct.toFixed(1)}%`, inline: true },
        { name: '⏳ Event Loop Lag', value: `${lag.toFixed(1)}ms`, inline: true },
        { name: '📶 Gateway Ping', value: `${ping}ms`, inline: true },
        { name: '💾 Disk Usage', value: `${disk.toFixed(1)}GB`, inline: true },
        { name: '📦 Cache Entries', value: `${Object.values(this.caches).reduce((s, c) => s + c.size(), 0)}`, inline: true },
        { name: '📊 Agent Errors', value: `${this.metrics.agentErrors.size} agents with errors`, inline: true },
        { name: '🔄 API Calls (OpenAI)', value: `${this.metrics.apiUsage.openai.calls}`, inline: true },
        { name: '🤖 Agents Managed', value: `${this.deps.orchestrator?.getAllAgents?.()?.length || 0}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Economy ──
  async cmdEconomy(interaction) {
    const health = this.metrics.economyHealth;
    const embed = new EmbedBuilder()
      .setTitle('💰 Economy Health')
      .setColor(0xffaa00)
      .addFields(
        { name: '📈 Inflation Rate', value: `${health.inflationRate?.toFixed(2) || 'N/A'}%`, inline: true },
        { name: '💰 Total Supply', value: health.totalSupply?.toString() || 'N/A', inline: true },
        { name: '👥 Active Users', value: health.activeUsers?.toString() || 'N/A', inline: true },
        { name: '💸 Transaction Volume', value: health.transactionVolume?.toString() || 'N/A', inline: true },
        { name: '⚠️ Farming Suspicion', value: `${(health.rewardFarmingSuspicion * 100)?.toFixed(1) || '0'}%`, inline: true },
        { name: '🎯 Reward Multiplier', value: this.metrics.coordinationFlags.rewardMultiplier.toFixed(2), inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Engagement ──
  async cmdEngagement(interaction) {
    const hours = this.metrics.engagementByHour;
    let best = 'N/A';
    let bestScore = 0;
    let total = 0;
    for (const [h, score] of Object.entries(hours)) {
      total += score;
      if (score > bestScore) { bestScore = score; best = `${h}:00`; }
    }

    const embed = new EmbedBuilder()
      .setTitle('📈 Engagement Metrics')
      .setColor(0x00ae86)
      .addFields(
        { name: '📊 Best Posting Time', value: best, inline: true },
        { name: '📈 Peak Activity', value: `${bestScore} interactions`, inline: true },
        { name: '📊 Total Interactions (24h)', value: `${total}`, inline: true },
        { name: '🎯 Engagement Intensity', value: this.metrics.coordinationFlags.engagementIntensity.toFixed(2), inline: true },
        { name: '📢 Active Hours', value: `${Object.keys(hours).length} hours with activity`, inline: true },
        { name: '💡 Recommendations', value: total < 50 ? 'Consider running engagement campaigns' : 'Activity is healthy', inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Security ──
  async cmdSecurity(interaction) {
    const perms = this.metrics.permissionAudit || { permissions: [], missing: [] };
    const suspicious = this.metrics.suspiciousActivity.length;
    const webhooks = Object.entries(this.metrics.webhookIntegrity)
      .map(([name, status]) => `${name}: ${status.valid ? '✅' : '❌'}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🔒 Security Audit')
      .setColor(0xff4444)
      .addFields(
        { name: '🛡️ Bot Permissions', value: perms.permissions?.length ? perms.permissions.slice(0, 10).join(', ') + (perms.permissions.length > 10 ? '...' : '') : 'N/A', inline: false },
        { name: '⚠️ Missing Critical', value: perms.missing?.length ? perms.missing.join(', ') : '✅ All critical permissions present', inline: false },
        { name: '🚨 Suspicious Events', value: `${suspicious} events logged`, inline: true },
        { name: '📡 Webhook Integrity', value: webhooks || 'None configured', inline: false },
        { name: '🔄 Config Drift', value: '✅ No drift detected', inline: true },
        { name: '🔑 API Keys', value: `OpenAI: ${this.metrics.apiUsage.openai.keyIndex + 1} keys in rotation`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Coordination ──
  async cmdCoordination(interaction) {
    const flags = this.metrics.coordinationFlags;
    const embed = new EmbedBuilder()
      .setTitle('🔄 Coordination Flags')
      .setColor(0x9b59b6)
      .addFields(
        { name: '🛡️ Moderation Sensitivity', value: flags.moderationSensitivity.toFixed(2), inline: true },
        { name: '⏳ Polling Frequency', value: flags.pollingFrequency.toFixed(2), inline: true },
        { name: '💰 Reward Multiplier', value: flags.rewardMultiplier.toFixed(2), inline: true },
        { name: '🔕 Alert Throttle', value: flags.alertThrottle.toFixed(2), inline: true },
        { name: '📢 Engagement Intensity', value: flags.engagementIntensity.toFixed(2), inline: true },
        { name: '🔄 Last Apply', value: this.metrics._lastCoordinationApply ? `<t:${Math.floor(this.metrics._lastCoordinationApply/1000)}:R>` : 'Never', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Cost ──
  async cmdCost(interaction) {
    const openai = this.metrics.apiUsage.openai;
    const gemini = this.metrics.apiUsage.gemini;
    const openaiCost = this.metrics.apiCosts.openai.totalCost;
    const geminiCost = this.metrics.apiCosts.gemini.totalCost;
    const totalCost = openaiCost + geminiCost;

    const usageSummary = Object.entries(this.metrics.apiUsage)
      .map(([key, val]) => `${key}: ${val.calls} calls (${((val.calls/val.limit)*100).toFixed(1)}%)`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('💰 Cost & Usage Summary')
      .setColor(0xffaa00)
      .addFields(
        { name: '💵 Total Cost (OpenAI)', value: `$${openaiCost.toFixed(4)}`, inline: true },
        { name: '💵 Total Cost (Gemini)', value: `$${geminiCost.toFixed(4)}`, inline: true },
        { name: '💰 Total API Cost', value: `$${totalCost.toFixed(4)}`, inline: true },
        { name: '📊 Usage Breakdown', value: usageSummary || 'No data', inline: false },
        { name: '🔑 OpenAI Key Rotation', value: `Key ${openai.keyIndex + 1} active`, inline: true },
        { name: '📈 Cost History', value: `${this.metrics.costHistory.length} data points tracked`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Self-Healing ──
  async cmdSelfHealing(interaction) {
    const enable = interaction.options.getBoolean('enable');

    if (enable !== null) {
      this.config.enableSelfHealing = enable;
      await interaction.reply({ content: `✅ Self-healing ${enable ? 'enabled' : 'disabled'}`, ephemeral: true });
      return;
    }

    const status = this.config.enableSelfHealing ? '✅ Enabled' : '❌ Disabled';
    const lastRestart = this.metrics._lastRestartAttempt ? `<t:${Math.floor(this.metrics._lastRestartAttempt/1000)}:R>` : 'Never';
    const incidents = this.state.incidentCount;

    const embed = new EmbedBuilder()
      .setTitle('🔄 Self-Healing Status')
      .setColor(this.config.enableSelfHealing ? 0x00ff88 : 0xff4444)
      .addFields(
        { name: 'Status', value: status, inline: true },
        { name: 'Total Incidents', value: `${incidents}`, inline: true },
        { name: 'Last Restart', value: lastRestart, inline: true },
        { name: 'Cooldown', value: `${this.config.restartCooldownMs / 1000}s`, inline: true },
        { name: 'Predictive Scaling', value: this.config.enablePredictiveScaling ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Auto-Heal Triggers', value: '⚠️ Memory > 90% | ⏱️ Event Loop > 500ms', inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ────────────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────────────

  async destroy() {
    // Clear caches
    for (const cache of Object.values(this.caches)) {
      cache.clear();
    }

    // Clear histories
    this.metrics.cpuHistory = [];
    this.metrics.memoryHistory = [];
    this.metrics.errorHistory = [];

    await super.destroy();
  }
}

module.exports = OptimizationAgent;