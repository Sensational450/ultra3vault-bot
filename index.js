/**
 * 🚀 Ultra3Vault v5.0 – Multi‑Agent Discord Bot
 * Entry point: initializes core, agents, web server, and scheduler.
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { EventBus } = require('./core/eventBus');
const { Logger } = require('./core/logger');
const { RateLimiter } = require('./core/rateLimiter');
const { Scheduler } = require('./core/scheduler');
const { Orchestrator } = require('./core/orchestrator');
const { Database } = require('./tools/database/db');
const Models = require('./tools/database/models');
const { WebServer } = require('./web/server');
const secrets = require('./config/secrets');

// ================= UNHANDLED ERROR HANDLERS =================
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err?.stack || err);
});

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ================= CORE COMPONENTS =================
const eventBus = new EventBus();
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
const models = new Models(db, eventBus, logger);

// ================= ORCHESTRATOR =================
const orchestrator = new Orchestrator(client, { eventBus, logger, rateLimiter });

// ================= AGENTS REGISTRATION =================
const ModerationAgent = require('./agents/moderationAgent');
const EconomyAgent = require('./agents/economyAgent');
const VipAgent = require('./agents/vipAgent');
const PriceFeedAgent = require('./agents/priceFeedAgent');
const NewsAgent = require('./agents/newsAgent');
const AiChatAgent = require('./agents/aiChatAgent');
const ReferralAgent = require('./agents/referralAgent');

orchestrator.registerAgent(new ModerationAgent(eventBus, { client, logger, db, models }), 100);
orchestrator.registerAgent(new EconomyAgent(eventBus, { client, logger, db, models }), 90);
orchestrator.registerAgent(new VipAgent(eventBus, { client, logger, db, models }), 80);
orchestrator.registerAgent(new PriceFeedAgent(eventBus, { client, logger, db, models }), 70);
orchestrator.registerAgent(new NewsAgent(eventBus, { client, logger, db, models }), 60);
orchestrator.registerAgent(new AiChatAgent(eventBus, { client, logger, db, models }), 50);
orchestrator.registerAgent(new ReferralAgent(eventBus, { client, logger, db, models }), 40);

// ================= EVENTS =================
require('./events/messageCreate')(client, orchestrator, { logger });
require('./events/interactionCreate')(client, orchestrator, { logger });
require('./events/guildMemberAdd')(client, orchestrator, { logger });
require('./events/ready')(client, orchestrator, { logger, registerCommands: require('./commands/register') });

// ================= JOBS (Scheduled Tasks) =================
const priceUpdater = require('./jobs/priceUpdater')({ eventBus, logger, cache: null });
const leaderboardReset = require('./jobs/leaderboardReset')({ eventBus, logger, models });
const subscriptionRenewal = require('./jobs/subscriptionRenewal')({ eventBus, logger, models, client });
const cleanupTempData = require('./jobs/cleanupTempData')({ eventBus, logger });

scheduler.registerJob('priceUpdater', '*/1 * * * *', priceUpdater);
scheduler.registerJob('leaderboardReset', '0 0 * * 0', leaderboardReset); // weekly
scheduler.registerJob('subscriptionRenewal', '0 */6 * * *', subscriptionRenewal); // every 6h
scheduler.registerJob('cleanupTempData', '0 */2 * * *', cleanupTempData); // every 2h

// ================= WEB SERVER =================
const webServer = new WebServer({
  eventBus,
  logger,
  client,
  db,
  caches: {}, // optional: pass cache/userMemory instances if needed
  orchestrator,
  port: process.env.PORT || 3000,
});

// ================= GRACEFUL SHUTDOWN =================
async function shutdown(signal) {
  logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
  await webServer.stop();
  await scheduler.shutdown();
  await orchestrator.destroy();
  await db.close();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ================= STARTUP =================
(async () => {
  try {
    await db.init();
    logger.info('✅ Database initialized');
    await webServer.start();
    logger.info('🌐 Web server started');
    await client.login(secrets.token);
    logger.info('🤖 Discord client login initiated');
  } catch (err) {
    logger.error(`💥 Startup error: ${err.message}`);
    process.exit(1);
  }
})();