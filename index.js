/**
 * 🚀 Ultra3Vault v7.1 – One‑Time DB Cleanup
 * Entry point: minimal agents, aggressive memory limits, optional web server.
 * Only loads essential agents: Moderation, Economy, VIP, Support, Referral,
 * Info, Summary, CommunityManager, Engagement, ContentPlanning,
 * Optimization, AlertPrioritization.
 * All heavy agents (News, Price, Whale, Airdrop, Signal, AI, AMA, etc.) removed.
 *
 * To run database cleanup:
 *   Set environment variable RUN_DB_CLEANUP=true in Render, deploy, wait for logs,
 *   then remove the variable and redeploy.
 */
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { EventBus } = require('./core/eventBus');
const { Logger } = require('./core/logger');
const { RateLimiter } = require('./core/rateLimiter');
const { Scheduler } = require('./core/scheduler');
const { Orchestrator } = require('./core/orchestrator');
const { Database } = require('./tools/database/db');
const Models = require('./tools/database/models');
const { WebServer } = require('./web/server');
const CacheManager = require('./tools/cacheManager');
const CleanupService = require('./jobs/cleanupTempData');
const secrets = require('./config/secrets');
const axios = require('axios');
const ButtonHandler = require('./tools/discord/buttonHandler');
const { sendWebhook } = require('./core/webhook');
const WebhookSender = require('./tools/discord/webhookSender');

// ================= UNHANDLED ERROR HANDLERS =================
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err?.stack || err);
});

// ================= DISCORD CLIENT (Memory‑Optimized) =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // GatewayIntentBits.GuildMembers,
  ],
  partials: [],
  sweepers: {
    messages: { interval: 60, lifetime: 300 },
    users: { interval: 120, filter: () => false },
    members: { interval: 120, filter: () => false },
  },
});

// ================= CORE COMPONENTS =================
const eventBus = new EventBus();
client.eventBus = eventBus;

const logger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  consoleEnabled: true,
  fileEnabled: true,
  filePath: 'logs/app.log',
  discordWebhook: process.env.LOG_WEBHOOK_URL,
  eventBus,
  serviceName: 'Ultra3Vault',
});

const rateLimiter = new RateLimiter({
  defaultLimit: 5,
  defaultWindowMs: 5000,
  slidingWindow: true,
  eventBus,
  logger,
});

const scheduler = new Scheduler(eventBus, logger, { timezone: 'UTC' });

// ================= DATABASE & MODELS =================
const db = new Database({
  dbPath: secrets.dbPath || './data.sqlite',
  migrationsPath: './tools/database/migrations',
  eventBus,
  logger,
});

// ================= CACHE MANAGER (Tight Limits) =================
const cacheManager = new CacheManager({
  eventBus,
  logger,
  defaultTTL: 30000,
  maxEntriesPerNamespace: 100,
  evictionStrategy: 'lru',
  cleanupInterval: 15000,
  memoryThreshold: 80,
  protectedNamespaces: ['config', 'admin'],
});

// ================= CLEANUP SERVICE =================
const cleanupService = new CleanupService({
  eventBus,
  logger,
  cacheManager,
  db,
  config: {
    cleanupInterval: 5 * 60 * 1000,
    defaultTTL: 3600000,
    memoryThreshold: 80,
    maxItemsPerCycle: 1000,
    protectedNamespaces: ['config', 'admin'],
  },
});

setTimeout(() => {
  cleanupService.startScheduler();
}, 30000);

// ================= ORCHESTRATOR & WEB SERVER =================
let orchestrator = null;
let webServer = null;

// ================= ESSENTIAL AGENTS =================
const ModerationAgent = require('./agents/moderationAgent');
const EconomyAgent = require('./agents/economyAgent');
const VipAgent = require('./agents/vipAgent');
const SupportAgent = require('./agents/supportAgent');
const ReferralAgent = require('./agents/referralAgent');
const InfoAgent = require('./agents/infoAgent');
const SummaryAgent = require('./agents/summaryAgent');
const CommunityManagerAgent = require('./agents/communityManagerAgent');
const EngagementAgent = require('./agents/engagementAgent');
const ContentPlanningAgent = require('./agents/contentPlanningAgent');
const OptimizationAgent = require('./agents/optimizationAgent');
const AlertPrioritizationAgent = require('./agents/alertPrioritizationAgent');

// ================= B2B HELPER =================
async function deliverToSubscribers(agentName, eventType, embed, options = {}) {
  try {
    const now = Date.now();
    const rows = await db.all(
      `SELECT userId, guildId, webhook_url, agentAccess FROM subscriptions
       WHERE webhook_url IS NOT NULL
         AND webhook_status = 'active'
         AND expiresAt > ?`,
      [now]
    );
    const subscribers = rows.filter(row => {
      try {
        const access = row.agentAccess ? JSON.parse(row.agentAccess) : ['moderation'];
        return access.includes(agentName);
      } catch {
        return false;
      }
    });
    if (subscribers.length === 0) return;
    const embedJson = embed.toJSON ? embed.toJSON() : embed;
    const payload = { embeds: [embedJson], ...options };
    for (const sub of subscribers) {
      try {
        await WebhookSender.send(sub.webhook_url, payload, {}, 2);
        logger.debug(`✅ B2B webhook delivered to ${sub.guildId} for ${agentName}`);
      } catch (err) {
        logger.warn(`❌ B2B webhook failed for ${sub.guildId} (${agentName}): ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`deliverToSubscribers error: ${err.message}`);
  }
}

// ================= ONE‑TIME DATABASE CLEANUP =================
// Runs only if RUN_DB_CLEANUP environment variable is set to 'true'
async function runDatabaseCleanup() {
  if (process.env.RUN_DB_CLEANUP !== 'true') {
    logger.debug('Skipping database cleanup (RUN_DB_CLEANUP not set)');
    return;
  }
  logger.info('🗑️ Running one‑time database cleanup...');

  const tables = [
    'price_history',
    'whale_transactions',
    'airdrop_posted_links',
    'news_cache',
    'ai_conversations',
    'price_alerts',
    'whale_watchlists',
    'whale_community_predictions',
    'whale_blacklist',
    'whale_wallet_performance',
    'airdrop_claims',
    'airdrop_user_prefs',
    'airdrop_github_tracking',
    'news_subscriptions',
  ];

  let total = 0;
  for (const table of tables) {
    try {
      const result = await db.run(`DELETE FROM ${table}`);
      const count = result.changes || 0;
      logger.info(`✅ ${table}: deleted ${count} rows`);
      total += count;
    } catch (err) {
      logger.warn(`⚠️ ${table}: ${err.message}`);
    }
  }

  logger.info(`🗑️ Total rows deleted: ${total}`);

  try {
    await db.run('VACUUM');
    logger.info('✅ Database compacted');
  } catch (err) {
    logger.warn(`⚠️ VACUUM failed: ${err.message}`);
  }

  logger.info('✅ Database cleanup complete');
}

// ================= STARTUP =================
(async () => {
  try {
    await db.init();
    logger.info('✅ Database initialized');

    // Run one‑time cleanup if requested (before loading agents)
    await runDatabaseCleanup();

    const models = new Models(db, eventBus, logger);
    orchestrator = new Orchestrator(client, { eventBus, logger, rateLimiter });
    client.orchestrator = orchestrator;

    // Globals
    client.cache = cacheManager;
    global.cache = cacheManager;
    client.cleanup = cleanupService;
    global.cleanup = cleanupService;

    const buttonHandler = new ButtonHandler({ logger, eventBus });
    buttonHandler.register('trivia_reveal', async (interaction) => {
      await interaction.reply({
        content: '🔍 **Answer:** Bitcoin was created in **2009** by the pseudonymous creator **Satoshi Nakamoto**.',
        ephemeral: true,
      });
    });

    // ─── Register only essential agents ───
    orchestrator.registerAgent(new ModerationAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 100);
    orchestrator.registerAgent(new EconomyAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 90);
    orchestrator.registerAgent(new VipAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 80);
    orchestrator.registerAgent(new AlertPrioritizationAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 55);
    orchestrator.registerAgent(new SupportAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 45);
    orchestrator.registerAgent(new ReferralAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 40);
    orchestrator.registerAgent(new InfoAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 30);
    orchestrator.registerAgent(new SummaryAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 25);
    orchestrator.registerAgent(new CommunityManagerAgent(eventBus, { client, logger, db, models, cache: cacheManager }), 20);
    orchestrator.registerAgent(new EngagementAgent(eventBus, { client, logger, db, models, orchestrator, cache: cacheManager }), 19);
    orchestrator.registerAgent(new ContentPlanningAgent(eventBus, { client, logger, db, models, orchestrator, cache: cacheManager }), 18);
    orchestrator.registerAgent(new OptimizationAgent(eventBus, { client, logger, db, models, orchestrator, cache: cacheManager }), 1);

    logger.info('✅ Essential agents registered (heavy agents removed)');

    // ─── Startup aggressive cleanup ───
    cacheManager.aggressiveEvict(30);
    logger.info('🧹 CacheManager aggressive eviction performed on startup');

    // ================= EVENT LISTENERS =================
    eventBus.on('economy.addBalance', async ({ userId, guildId, amount, reason }) => {
      try {
        let user = await models.User.findOne({ where: { userId, guildId } });
        if (!user) {
          user = await models.User.create({ userId, guildId, balance: 0 });
        }
        user.balance = (user.balance || 0) + amount;
        await user.save();
        logger.debug(`💰 Added ${amount} tokens to ${userId} (${reason})`);
      } catch (err) {
        logger.error(`Failed to add balance: ${err.message}`);
      }
    });

    // ================= ATTACH DISCORD EVENTS =================
    require('./events/messageCreate')(client, orchestrator, { logger });
    require('./events/interactionCreate')(client, orchestrator, { logger, buttonHandler });
    require('./events/guildMemberAdd')(client, orchestrator, { logger });
    require('./events/ready')(client, orchestrator, { logger, registerCommands: require('./commands/register') });

    // ================= SCHEDULED JOBS =================
    const leaderboardReset = require('./jobs/leaderboardReset')({ eventBus, logger, models });
    const subscriptionRenewal = require('./jobs/subscriptionRenewal')({ eventBus, logger, models, client });
    const dailyRetention = require('./jobs/dailyRetention')({ eventBus, logger, models, client, orchestrator });
    const weeklyGrowthReport = require('./jobs/weeklyGrowthReport')({ eventBus, logger, models, client, orchestrator });
    const inactivityCheck = require('./jobs/inactivityCheck')({ eventBus, logger, models, client, orchestrator });
    const healthCheck = require('./jobs/healthCheck')({ eventBus, logger, orchestrator });
    const cacheCleanup = require('./jobs/cacheCleanup')({ eventBus, logger, orchestrator, cacheManager });
    const memoryMonitor = require('./jobs/memoryMonitor')({ eventBus, logger, orchestrator, cacheManager, cleanupService });
    const logRotation = require('./jobs/logRotation')({ eventBus, logger, orchestrator });
    const tempCleanup = require('./jobs/tempCleanup')({ eventBus, logger, orchestrator });
    const performanceReport = require('./jobs/performanceReport')({ eventBus, logger, orchestrator });
    const dailyContent = require('./jobs/dailyContent')({ eventBus, logger, orchestrator });
    const educationalContent = require('./jobs/educationalContent')({ eventBus, logger, orchestrator });
    const marketRecap = require('./jobs/marketRecap')({ eventBus, logger, orchestrator });
    const engagementContent = require('./jobs/engagementContent')({ eventBus, logger, orchestrator });
    const announcementReminder = require('./jobs/announcementReminder')({ eventBus, logger, orchestrator });
    const vipContent = require('./jobs/vipContent')({ eventBus, logger, orchestrator });
    const premiumContent = require('./jobs/premiumContent')({ eventBus, logger, orchestrator });
    const performanceAnalysis = require('./jobs/performanceAnalysis')({ eventBus, logger, orchestrator });
    const trendDetection = require('./jobs/trendDetection')({ eventBus, logger, orchestrator });
    const sentimentAnalysis = require('./jobs/sentimentAnalysis')({ eventBus, logger, orchestrator });
    const suggestionReport = require('./jobs/suggestionReport')({ eventBus, logger, orchestrator });
    const trialExpiry = require('./jobs/trialExpiry')({ eventBus, logger, orchestrator });
    const conversationStarter = async () => eventBus.emit('job.conversationStarter');
    const dailyPoll = async () => eventBus.emit('job.dailyPoll');
    const dailyQuiz = async () => eventBus.emit('job.dailyQuiz');
    const dailyDebate = async () => eventBus.emit('job.dailyDebate');
    const trivia = async () => eventBus.emit('job.trivia');
    const mentor = async () => eventBus.emit('job.mentor');
    const autoSummarize = async () => eventBus.emit('job.autoSummarize');

    // ─── Register jobs ───
    scheduler.registerJob('leaderboardReset', '0 0 * * 0', leaderboardReset);
    scheduler.registerJob('subscriptionRenewal', '0 */6 * * *', subscriptionRenewal);
    scheduler.registerJob('dailyRetention', '0 20 * * *', dailyRetention);
    scheduler.registerJob('weeklyGrowthReport', '0 9 * * 1', weeklyGrowthReport);
    scheduler.registerJob('inactivityCheck', '0 10 * * 0', inactivityCheck);
    scheduler.registerJob('healthCheck', '*/15 * * * *', healthCheck);
    scheduler.registerJob('cacheCleanup', '*/30 * * * *', cacheCleanup);
    scheduler.registerJob('memoryMonitor', '*/10 * * * *', memoryMonitor);
    scheduler.registerJob('logRotation', '0 0 * * *', logRotation);
    scheduler.registerJob('tempCleanup', '0 0 * * 0', tempCleanup);
    scheduler.registerJob('performanceReport', '0 20 * * 0', performanceReport);
    scheduler.registerJob('dailyContent', '0 9 * * *', dailyContent);
    scheduler.registerJob('educationalContent', '0 */6 * * *', educationalContent);
    scheduler.registerJob('marketRecap', '0 20 * * *', marketRecap);
    scheduler.registerJob('engagementContent', '0 */12 * * *', engagementContent);
    scheduler.registerJob('announcementReminder', '0 */4 * * *', announcementReminder);
    scheduler.registerJob('vipContent', '0 10 * * *', vipContent);
    scheduler.registerJob('premiumContent', '0 12 * * *', premiumContent);
    scheduler.registerJob('performanceAnalysis', '0 */6 * * *', performanceAnalysis);
    scheduler.registerJob('trendDetection', '0 0 * * *', trendDetection);
    scheduler.registerJob('sentimentAnalysis', '0 */6 * * *', sentimentAnalysis);
    scheduler.registerJob('suggestionReport', '0 20 * * 0', suggestionReport);
    scheduler.registerJob('trialExpiry', '0 * * * *', trialExpiry);
    scheduler.registerJob('conversationStarter', '0 9 * * *', conversationStarter);
    scheduler.registerJob('dailyPoll', '0 10 * * *', dailyPoll);
    scheduler.registerJob('dailyQuiz', '0 11 * * *', dailyQuiz);
    scheduler.registerJob('dailyDebate', '0 12 * * *', dailyDebate);
    scheduler.registerJob('trivia', '0 14 * * *', trivia);
    scheduler.registerJob('mentor', '0 15 * * *', mentor);
    scheduler.registerJob('autoSummarize', '*/10 * * * *', autoSummarize);

    if (process.env.LEADERBOARD_WEBHOOK_URL) {
      const weeklyLeaderboard = require('./jobs/weeklyLeaderboard')({
        eventBus,
        logger,
        models,
        client,
      });
      scheduler.registerJob('weeklyLeaderboard', '0 9 * * 1', weeklyLeaderboard);
      logger.info('📅 Weekly leaderboard job scheduled');
    } else {
      logger.warn('⚠️ LEADERBOARD_WEBHOOK_URL not set – weekly leaderboard disabled');
    }

    scheduler.registerJob('engagementCheck', '0 0 * * *', async () => eventBus.emit('job.engagementCheck'));
    scheduler.registerJob('announcementCheck', '0 * * * *', async () => eventBus.emit('job.announcementCheck'));

    if (process.env.RENDER_EXTERNAL_URL) {
      scheduler.registerJob('selfPing', '*/10 * * * *', async () => {
        try {
          await axios.get(`${process.env.RENDER_EXTERNAL_URL}/api`);
          logger.debug('🔁 Self-ping sent');
        } catch (err) {
          logger.debug(`Self-ping failed: ${err.message}`);
        }
      });
    }

    // Scheduler starts automatically

    // Discord reconnection handlers
    client.on('shardDisconnect', (event, id) => {
      logger.warn(`🔌 Shard ${id} disconnected. Reconnecting...`);
      setTimeout(() => client.login(secrets.token), 5000);
    });
    client.on('shardReconnecting', (id) => {
      logger.info(`🔄 Shard ${id} reconnecting...`);
    });
    client.on('shardResume', (id, replayedEvents) => {
      logger.info(`✅ Shard ${id} resumed (${replayedEvents} events)`);
    });

    // ─── Web Server (Disabled by default) ───
    // Uncomment if you need the B2B dashboard.
    /*
    webServer = new WebServer({ ... });
    await webServer.start();
    */

    // Login to Discord
    await client.login(secrets.token);
    logger.info('🤖 Discord client login initiated');
  } catch (err) {
    logger.error(`💥 Startup error: ${err.message}`);
    process.exit(1);
  }
})();

// ================= GRACEFUL SHUTDOWN =================
let shutdownCalled = false;
async function shutdown(signal) {
  if (shutdownCalled) return;
  shutdownCalled = true;
  logger.info(`🛑 Received ${signal}, shutting down...`);
  if (webServer) await webServer.stop();
  if (scheduler) await scheduler.shutdown();
  if (orchestrator) await orchestrator.destroy();
  if (db) await db.close();
  if (cacheManager) await cacheManager.shutdown();
  if (cleanupService) await cleanupService.shutdown();
  if (client) client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { sendWebhook };