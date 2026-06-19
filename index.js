/**
 * 🚀 Ultra3Vault v5.0 – Multi‑Agent Discord Bot
 * Entry point: initializes core, agents, web server, and scheduler.
 */
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js'); // added EmbedBuilder
const { EventBus } = require('./core/eventBus');
const { Logger } = require('./core/logger');
const { RateLimiter } = require('./core/rateLimiter');
const { Scheduler } = require('./core/scheduler');
const { Orchestrator } = require('./core/orchestrator');
const { Database } = require('./tools/database/db');
const Models = require('./tools/database/models');
const { WebServer } = require('./web/server');
const secrets = require('./config/secrets');
const axios = require('axios');

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

// ================= ORCHESTRATOR & WEB SERVER (outer scope) =================
let orchestrator = null;
let webServer = null;

// ================= AGENT FACTORIES =================
const ModerationAgent = require('./agents/moderationAgent');
const EconomyAgent = require('./agents/economyAgent');
const VipAgent = require('./agents/vipAgent');
const PriceFeedAgent = require('./agents/priceFeedAgent');
const NewsAgent = require('./agents/newsAgent');
const ReferralAgent = require('./agents/referralAgent');
const InfoAgent = require('./agents/infoAgent');
const AirdropAgent = require('./agents/airdropAgent');
const SummaryAgent = require('./agents/summaryAgent'); // 👈 NEW

let AiChatAgent = null;
try {
  if (secrets.openaiApiKey) {
    AiChatAgent = require('./agents/aiChatAgent');
    logger.info('🧠 OpenAI API key found – AiChatAgent will be loaded');
  } else {
    logger.warn('⚠️ OPENAI_API_KEY missing – AiChatAgent disabled');
  }
} catch (err) {
  logger.warn(`⚠️ Could not load AiChatAgent: ${err.message}`);
}

// ================= STARTUP =================
(async () => {
  try {
    await db.init();
    logger.info('✅ Database initialized');

    const models = new Models(db, eventBus, logger);
    orchestrator = new Orchestrator(client, { eventBus, logger, rateLimiter });
    client.orchestrator = orchestrator;

    // Register all agents
    orchestrator.registerAgent(new ModerationAgent(eventBus, { client, logger, db, models }), 100);
    orchestrator.registerAgent(new EconomyAgent(eventBus, { client, logger, db, models }), 90);
    orchestrator.registerAgent(new VipAgent(eventBus, { client, logger, db, models }), 80);
    orchestrator.registerAgent(new PriceFeedAgent(eventBus, { client, logger, db, models }), 70);
    orchestrator.registerAgent(new NewsAgent(eventBus, { client, logger, db, models }), 60);
    if (AiChatAgent) {
      orchestrator.registerAgent(new AiChatAgent(eventBus, { client, logger, db, models }), 50);
    }
    orchestrator.registerAgent(new ReferralAgent(eventBus, { client, logger, db, models }), 40);
    orchestrator.registerAgent(new AirdropAgent(eventBus, { client, logger, db, models }), 35);
    orchestrator.registerAgent(new InfoAgent(eventBus, { client, logger, db, models }), 30);
    orchestrator.registerAgent(new SummaryAgent(eventBus, { client, logger, db, models }), 25); // 👈 NEW (lower priority)

    logger.info('✅ All agents registered');

    // 🔔 Check for required news API key
    if (!process.env.NEWSDATA_API_KEY) {
      logger.warn('⚠️ NEWSDATA_API_KEY is not set. NewsAgent will not fetch articles. Please add the key to Render environment variables.');
    }
    // 🔔 Check for premium airdrop channel
    if (!process.env.PREMIUM_AIRDROP_CHANNEL_ID) {
      logger.warn('⚠️ PREMIUM_AIRDROP_CHANNEL_ID is not set. AirdropAgent will be disabled.');
    }

    // ================= AUTO‑SUMMARY POSTER =================
    // Listens for 'news.summarized' and posts to all subscribed news channels
    eventBus.on('news.summarized', async (data) => {
      const { summary, original, category } = data;
      logger.debug(`📝 Auto‑summary generated for: ${original.title}`);

      // Get the NewsAgent instance to retrieve subscriptions
      const newsAgent = orchestrator.getAgent('NewsAgent');
      if (!newsAgent) {
        logger.warn('⚠️ NewsAgent not found – cannot post auto‑summary');
        return;
      }

      // For each guild and category subscription, post the summary
      for (const [guildId, subs] of newsAgent.subscriptions.entries()) {
        for (const [cat, channelId] of subs.entries()) {
          // Optionally match category to the one from the event, or post to all
          // Here we post to all subscribed channels regardless of category
          const channel = client.channels.cache.get(channelId);
          if (!channel || !channel.isTextBased()) continue;

          try {
            const embed = new EmbedBuilder()
              .setTitle('📰 Auto‑Summary')
              .setDescription(summary || 'No summary available.')
              .addFields(
                { name: 'Original', value: `[${original.title}](${original.link})`, inline: false },
                { name: 'Category', value: category || 'General', inline: true }
              )
              .setColor(0x00ff88)
              .setTimestamp()
              .setFooter({ text: 'Ultra3Vault • Auto‑generated' });

            await channel.send({ embeds: [embed] });
            logger.debug(`✅ Auto‑summary posted to #${channel.name}`);
          } catch (err) {
            logger.error(`Failed to post auto‑summary: ${err.message}`);
          }
        }
      }
    });

    // Attach Discord events
    require('./events/messageCreate')(client, orchestrator, { logger });
    require('./events/interactionCreate')(client, orchestrator, { logger });
    require('./events/guildMemberAdd')(client, orchestrator, { logger });
    require('./events/ready')(client, orchestrator, { logger, registerCommands: require('./commands/register') });

    // ================= SCHEDULED JOBS =================
    const priceUpdater = require('./jobs/priceUpdater')({ eventBus, logger, cache: null });
    const leaderboardReset = require('./jobs/leaderboardReset')({ eventBus, logger, models });
    const subscriptionRenewal = require('./jobs/subscriptionRenewal')({ eventBus, logger, models, client });
    const cleanupTempData = require('./jobs/cleanupTempData')({ eventBus, logger });
    const newsUpdater = require('./jobs/newsUpdater')({ eventBus, logger });

    scheduler.registerJob('priceUpdater', '*/1 * * * *', priceUpdater);
    scheduler.registerJob('leaderboardReset', '0 0 * * 0', leaderboardReset);
    scheduler.registerJob('subscriptionRenewal', '0 */6 * * *', subscriptionRenewal);
    scheduler.registerJob('cleanupTempData', '0 */2 * * *', cleanupTempData);
    scheduler.registerJob('newsUpdater', '*/10 * * * *', newsUpdater);

    // Weekly leaderboard posting job
    const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (leaderboardChannelId) {
      const weeklyLeaderboard = require('./jobs/weeklyLeaderboard')({
        eventBus,
        logger,
        models,
        client,
        channelId: leaderboardChannelId,
      });
      scheduler.registerJob('weeklyLeaderboard', '0 9 * * 1', weeklyLeaderboard);
      logger.info('📅 Weekly leaderboard posting job scheduled');
    } else {
      logger.warn('⚠️ LEADERBOARD_CHANNEL_ID not set – weekly leaderboard posting disabled');
    }

    // ================= AIRDROP JOB (every 30 minutes) =================
    scheduler.registerJob('airdropCheck', '*/30 * * * *', async () => {
      eventBus.emit('job.airdropCheck');
    });
    logger.info('🎁 Airdrop check job scheduled (every 30 minutes)');

    // Self‑ping job
    if (process.env.RENDER_EXTERNAL_URL) {
      scheduler.registerJob('selfPing', '*/10 * * * *', async () => {
        try {
          await axios.get(`${process.env.RENDER_EXTERNAL_URL}/api`);
          logger.debug('🔁 Self-ping sent to keep service awake');
        } catch (err) {
          logger.debug(`Self-ping failed: ${err.message}`);
        }
      });
    }

    // Discord reconnection handlers
    client.on('shardDisconnect', (event, id) => {
      logger.warn(`🔌 Shard ${id} disconnected. Attempting to reconnect...`);
      setTimeout(() => client.login(secrets.token), 5000);
    });
    client.on('shardReconnecting', (id) => {
      logger.info(`🔄 Shard ${id} is reconnecting...`);
    });
    client.on('shardResume', (id, replayedEvents) => {
      logger.info(`✅ Shard ${id} resumed (${replayedEvents} events replayed)`);
    });

    // Start web server
    webServer = new WebServer({
      eventBus,
      logger,
      client,
      db,
      models,
      caches: {},
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
async function shutdown(signal) {
  logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
  if (webServer) await webServer.stop();
  if (scheduler) await scheduler.shutdown();
  if (orchestrator) await orchestrator.destroy();
  if (db) await db.close();
  if (client) client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));