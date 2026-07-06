/**
 * 🚀 Ultra3Vault v6.9 – Clean Free‑Tier Version
 * Entry point: initializes core, essential agents, web server, and scheduler.
 * Only loads agents that are actively used: Moderation, Economy, VIP, Support,
 * Referral, Info, Summary, CommunityManager, Engagement, ContentPlanning,
 * Optimization, AlertPrioritization.
 * All heavy agents (News, Price, Whale, Airdrop, Signal, AI, AMA, etc.) are removed.
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
    // GatewayIntentBits.GuildMembers, // removed to reduce memory
  ],
  partials: [],
  sweepers: {
    messages: { interval: 120, lifetime: 600 },
    users: { interval: 300, filter: () => false },
    members: { interval: 300, filter: () => false },
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

// ================= CACHE MANAGER =================
const cacheManager = new CacheManager({
  eventBus,
  logger,
  defaultTTL: 60000,
  maxEntriesPerNamespace: 200,
  evictionStrategy: 'lru',
  cleanupInterval: 30000,
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

// ================= ESSENTIAL AGENTS (only those actually used) =================
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

// ================= B2B HELPER (kept for future) =================
async function deliverToSubscribers(agentName, eventType, embed, options = {}) {
  // ... (same as before) ...
  // (keep as is)
}

// ================= STARTUP =================
(async () => {
  try {
    await db.init();
    logger.info('✅ Database initialized');

    const models = new Models(db, eventBus, logger);
    orchestrator = new Orchestrator(client, { eventBus, logger, rateLimiter });
    client.orchestrator = orchestrator;

    // Globals for easy access
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

    // ================= EVENT LISTENERS (only active) =================
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

    // ================= SCHEDULED JOBS (only those used by active agents) =================
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

    // Keep engagement checks
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

    // Start web server
    webServer = new WebServer({
      eventBus,
      logger,
      client,
      db,
      models,
      caches: { manager: cacheManager },
      orchestrator,
      port: process.env.PORT || 3000,
    });
    await webServer.start();
    logger.info('🌐 Web server started');

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