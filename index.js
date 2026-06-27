/**
 * 🚀 Ultra3Vault v5.0 – Multi‑Agent Discord Bot
 * Entry point: initializes core, agents, web server, and scheduler.
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
const secrets = require('./config/secrets');
const axios = require('axios');
const ButtonHandler = require('./tools/discord/buttonHandler');

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
const SummaryAgent = require('./agents/summaryAgent');
const SupportAgent = require('./agents/supportAgent');
const WhaleAgent = require('./agents/whaleAgent');
const AlertPrioritizationAgent = require('./agents/alertPrioritizationAgent');
const CommunityManagerAgent = require('./agents/communityManagerAgent');
const SignalAgent = require('./agents/signalAgent');
const RecommendationAgent = require('./agents/recommendationAgent');
const GrowthRetentionAgent = require('./agents/growthRetentionAgent');
const OptimizationAgent = require('./agents/optimizationAgent');
const LocalizationAgent = require('./agents/localizationAgent');
const ContentPlanningAgent = require('./agents/contentPlanningAgent');
const AMAAgent = require('./agents/amaAgent');
const SelfImprovementAgent = require('./agents/selfImprovementAgent');
const EngagementAgent = require('./agents/engagementAgent');
const SocialFeedAgent = require('./agents/socialFeedAgent'); // 👈 NEW

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

    // 👇 INITIALIZE BUTTON HANDLER
    const buttonHandler = new ButtonHandler({ logger, eventBus });
    // Register trivia reveal button
    buttonHandler.register('trivia_reveal', async (interaction) => {
      await interaction.reply({
        content: '🔍 **Answer:** Bitcoin was created in **2009** by the pseudonymous creator **Satoshi Nakamoto**.',
        ephemeral: true,
      });
    });
    // Register any other buttons (e.g., pagination, confirmations) as needed

    // Register all agents (priorities: higher = more important)
    orchestrator.registerAgent(new ModerationAgent(eventBus, { client, logger, db, models }), 100);
    orchestrator.registerAgent(new EconomyAgent(eventBus, { client, logger, db, models }), 90);
    orchestrator.registerAgent(new VipAgent(eventBus, { client, logger, db, models }), 80);
    orchestrator.registerAgent(new PriceFeedAgent(eventBus, { client, logger, db, models }), 70);
    orchestrator.registerAgent(new WhaleAgent(eventBus, { client, logger, db, models }), 65);
    orchestrator.registerAgent(new NewsAgent(eventBus, { client, logger, db, models }), 60);
    orchestrator.registerAgent(new AlertPrioritizationAgent(eventBus, { client, logger, db, models }), 55);
    orchestrator.registerAgent(new SignalAgent(eventBus, { client, logger, db, models }), 54);
    if (AiChatAgent) {
      orchestrator.registerAgent(new AiChatAgent(eventBus, { client, logger, db, models }), 50);
    }
    // 👇 AMA Agent (high priority for AMA channel)
    orchestrator.registerAgent(new AMAAgent(eventBus, { client, logger, db, models, orchestrator }), 48);
    orchestrator.registerAgent(new SupportAgent(eventBus, { client, logger, db, models }), 45);
    orchestrator.registerAgent(new ReferralAgent(eventBus, { client, logger, db, models }), 40);
    orchestrator.registerAgent(new AirdropAgent(eventBus, { client, logger, db, models }), 35);
    orchestrator.registerAgent(new InfoAgent(eventBus, { client, logger, db, models }), 30);
    orchestrator.registerAgent(new SummaryAgent(eventBus, { client, logger, db, models }), 25);
    orchestrator.registerAgent(new CommunityManagerAgent(eventBus, { client, logger, db, models }), 20);
    orchestrator.registerAgent(new EngagementAgent(eventBus, { client, logger, db, models, orchestrator }), 19);
    orchestrator.registerAgent(new ContentPlanningAgent(eventBus, { client, logger, db, models, orchestrator }), 18);
    orchestrator.registerAgent(new LocalizationAgent(eventBus, { client, logger, db, models }), 15);
    orchestrator.registerAgent(new SocialFeedAgent(eventBus, { client, logger, db, models, orchestrator }), 14); // 📡 NEW
    orchestrator.registerAgent(new RecommendationAgent(eventBus, { client, logger, db, models }), 10);
    orchestrator.registerAgent(new GrowthRetentionAgent(eventBus, { client, logger, db, models }), 5);
    orchestrator.registerAgent(new OptimizationAgent(eventBus, { client, logger, db, models, orchestrator }), 1);
    orchestrator.registerAgent(new SelfImprovementAgent(eventBus, { client, logger, db, models, orchestrator }), 0);

    logger.info('✅ All agents registered');

    // 🔔 Check for required API keys (optional)
    if (!process.env.NEWSDATA_API_KEY) {
      logger.warn('⚠️ NEWSDATA_API_KEY is not set. NewsAgent will not fetch articles. Please add the key to Render environment variables.');
    }
    if (!process.env.PREMIUM_AIRDROP_CHANNEL_ID) {
      logger.warn('⚠️ PREMIUM_AIRDROP_CHANNEL_ID is not set. AirdropAgent will be disabled.');
    }
    if (!process.env.WHALE_ALERT_CHANNEL_ID && !process.env.ETHERSCAN_API_KEY) {
      logger.warn('⚠️ No whale alert channel or Etherscan key set. WhaleAgent may not function.');
    }
    if (!process.env.AMA_CHANNEL_ID) {
      logger.warn('⚠️ AMA_CHANNEL_ID not set. AMAAgent will be disabled.');
    }
    if (!process.env.FEEDBACK_CHANNEL_ID) {
      logger.warn('⚠️ FEEDBACK_CHANNEL_ID not set. SelfImprovementAgent feedback mining disabled.');
    }

    // ================= ECONOMY REWARD LISTENER =================
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

    // ================= AUTO‑SUMMARY POSTER =================
    eventBus.on('news.summarized', async (data) => {
      const { summary, original, category } = data;
      logger.debug(`📝 Auto‑summary generated for: ${original.title}`);

      const newsAgent = orchestrator.getAgent('NewsAgent');
      if (!newsAgent) {
        logger.warn('⚠️ NewsAgent not found – cannot post auto‑summary');
        return;
      }

      for (const [guildId, subs] of newsAgent.subscriptions.entries()) {
        for (const [cat, channelId] of subs.entries()) {
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

    // ================= WHALE ALERT POSTER =================
    eventBus.on('whale.detected', async (tx) => {
      const channelId = process.env.WHALE_ALERT_CHANNEL_ID;
      if (!channelId) {
        logger.warn('⚠️ WHALE_ALERT_CHANNEL_ID not set – whale alerts disabled.');
        return;
      }

      try {
        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`Whale channel ${channelId} not found`);
          return;
        }

        const whaleAgent = orchestrator.getAgent('WhaleAgent');
        if (!whaleAgent) {
          logger.warn('WhaleAgent not found');
          return;
        }

        const embed = whaleAgent.formatWhaleEmbed(tx);
        await channel.send({ embeds: [embed] });
        logger.info(`🐋 Whale alert posted to #${channel.name}`);
      } catch (err) {
        logger.error(`Failed to post whale alert: ${err.message}`);
      }
    });

    // ================= PREMIUM SIGNAL POSTER =================
    eventBus.on('signal.generated', async (signal) => {
      const channelId = process.env.PREMIUM_SIGNAL_CHANNEL_ID;
      if (!channelId) {
        logger.warn('⚠️ PREMIUM_SIGNAL_CHANNEL_ID not set – signals disabled.');
        return;
      }

      try {
        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`Premium signal channel ${channelId} not found`);
          return;
        }

        const signalAgent = orchestrator.getAgent('SignalAgent');
        if (!signalAgent) {
          logger.warn('SignalAgent not found');
          return;
        }

        const embed = signalAgent.formatSignalEmbed(signal);
        await channel.send({ embeds: [embed] });
        logger.info(`📈 Premium signal posted to #${channel.name}`);
      } catch (err) {
        logger.error(`Failed to post premium signal: ${err.message}`);
      }
    });

    // ================= RECOMMENDATION POSTERS =================
    // VIP Recommendations
    eventBus.on('recommendation.generated', async (rec) => {
      if (rec.tier !== 'vip') return;

      const channelId = process.env.VIP_RECOMMENDATION_CHANNEL_ID;
      if (!channelId) {
        logger.warn('⚠️ VIP_RECOMMENDATION_CHANNEL_ID not set – VIP recs disabled.');
        return;
      }

      try {
        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`VIP rec channel ${channelId} not found`);
          return;
        }

        const recAgent = orchestrator.getAgent('RecommendationAgent');
        if (!recAgent) {
          logger.warn('RecommendationAgent not found');
          return;
        }

        const embed = recAgent.formatRecommendationEmbed(rec);
        await channel.send({ embeds: [embed] });
        logger.info(`🔶 VIP recommendation posted to #${channel.name}`);
      } catch (err) {
        logger.error(`Failed to post VIP recommendation: ${err.message}`);
      }
    });

    // Premium Recommendations
    eventBus.on('recommendation.generated', async (rec) => {
      if (rec.tier !== 'premium') return;

      const channelId = process.env.PREMIUM_RECOMMENDATION_CHANNEL_ID;
      if (!channelId) {
        logger.warn('⚠️ PREMIUM_RECOMMENDATION_CHANNEL_ID not set – Premium recs disabled.');
        return;
      }

      try {
        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`Premium rec channel ${channelId} not found`);
          return;
        }

        const recAgent = orchestrator.getAgent('RecommendationAgent');
        if (!recAgent) {
          logger.warn('RecommendationAgent not found');
          return;
        }

        const embed = recAgent.formatRecommendationEmbed(rec);
        await channel.send({ embeds: [embed] });
        logger.info(`💎 Premium recommendation posted to #${channel.name}`);
      } catch (err) {
        logger.error(`Failed to post Premium recommendation: ${err.message}`);
      }
    });

    // Attach Discord events (pass buttonHandler)
    require('./events/messageCreate')(client, orchestrator, { logger });
    require('./events/interactionCreate')(client, orchestrator, { logger, buttonHandler });
    require('./events/guildMemberAdd')(client, orchestrator, { logger });
    require('./events/ready')(client, orchestrator, { logger, registerCommands: require('./commands/register') });

    // ================= SCHEDULED JOBS =================
    const priceUpdater = require('./jobs/priceUpdater')({ eventBus, logger, cache: null });
    const leaderboardReset = require('./jobs/leaderboardReset')({ eventBus, logger, models });
    const subscriptionRenewal = require('./jobs/subscriptionRenewal')({ eventBus, logger, models, client });
    const cleanupTempData = require('./jobs/cleanupTempData')({ eventBus, logger });
    const newsUpdater = require('./jobs/newsUpdater')({ eventBus, logger });

    // 👇 GROWTH/RETENTION JOBS
    const dailyRetention = require('./jobs/dailyRetention')({ eventBus, logger, models, client, orchestrator });
    const weeklyGrowthReport = require('./jobs/weeklyGrowthReport')({ eventBus, logger, models, client, orchestrator });
    const inactivityCheck = require('./jobs/inactivityCheck')({ eventBus, logger, models, client, orchestrator });

    // 👇 OPTIMIZATION JOBS
    const healthCheck = require('./jobs/healthCheck')({ eventBus, logger, orchestrator });
    const cacheCleanup = require('./jobs/cacheCleanup')({ eventBus, logger, orchestrator });
    const memoryMonitor = require('./jobs/memoryMonitor')({ eventBus, logger, orchestrator });
    const logRotation = require('./jobs/logRotation')({ eventBus, logger, orchestrator });
    const tempCleanup = require('./jobs/tempCleanup')({ eventBus, logger, orchestrator });
    const performanceReport = require('./jobs/performanceReport')({ eventBus, logger, orchestrator });

    // 👇 CONTENT PLANNING JOBS
    const dailyContent = require('./jobs/dailyContent')({ eventBus, logger, orchestrator });
    const educationalContent = require('./jobs/educationalContent')({ eventBus, logger, orchestrator });
    const marketRecap = require('./jobs/marketRecap')({ eventBus, logger, orchestrator });
    const engagementContent = require('./jobs/engagementContent')({ eventBus, logger, orchestrator });
    const announcementReminder = require('./jobs/announcementReminder')({ eventBus, logger, orchestrator });
    const vipContent = require('./jobs/vipContent')({ eventBus, logger, orchestrator });
    const premiumContent = require('./jobs/premiumContent')({ eventBus, logger, orchestrator });

    // 👇 AMA JOB
    const amaSummary = require('./jobs/amaSummary')({ eventBus, logger, orchestrator });

    // 👇 SELF-IMPROVEMENT JOBS
    const performanceAnalysis = require('./jobs/performanceAnalysis')({ eventBus, logger, orchestrator });
    const feedbackMining = require('./jobs/feedbackMining')({ eventBus, logger, orchestrator });
    const trendDetection = require('./jobs/trendDetection')({ eventBus, logger, orchestrator });
    const sentimentAnalysis = require('./jobs/sentimentAnalysis')({ eventBus, logger, orchestrator });
    const suggestionReport = require('./jobs/suggestionReport')({ eventBus, logger, orchestrator });

    // 👇 TRIAL EXPIRY JOB
    const trialExpiry = require('./jobs/trialExpiry')({ eventBus, logger, orchestrator });

    // 👇 ENGAGEMENT JOBS
    const conversationStarter = async () => eventBus.emit('job.conversationStarter');
    const dailyPoll = async () => eventBus.emit('job.dailyPoll');
    const dailyQuiz = async () => eventBus.emit('job.dailyQuiz');
    const dailyDebate = async () => eventBus.emit('job.dailyDebate');
    const trivia = async () => eventBus.emit('job.trivia');
    const mentor = async () => eventBus.emit('job.mentor');
    const autoSummarize = async () => eventBus.emit('job.autoSummarize');

    // 👇 SOCIAL FEED JOB
    const socialFeed = async () => eventBus.emit('job.socialFeed');

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

    // ================= WHALE CHECK JOB (every 5 minutes) =================
    scheduler.registerJob('whaleCheck', process.env.WHALE_CHECK_INTERVAL || '*/5 * * * *', async () => {
      eventBus.emit('job.whaleCheck');
    });
    logger.info('🐋 Whale check job scheduled');

    // ================= SIGNAL CHECK JOB (every 5 minutes) =================
    scheduler.registerJob('signalCheck', '*/5 * * * *', async () => {
      eventBus.emit('job.signalCheck');
    });
    logger.info('📈 Signal check job scheduled');

    // ================= RECOMMENDATION SCAN JOB (every 15 minutes) =================
    scheduler.registerJob('recommendationCheck', '*/15 * * * *', async () => {
      eventBus.emit('job.recommendationCheck');
    });
    logger.info('🧠 Recommendation scan job scheduled (every 15 minutes)');

    // ================= COMMUNITY MANAGER JOBS =================
    scheduler.registerJob('announcementCheck', '0 * * * *', async () => {
      eventBus.emit('job.announcementCheck');
    });
    logger.info('📢 Auto‑announcement check job scheduled (every hour)');

    scheduler.registerJob('engagementCheck', '0 0 * * *', async () => {
      eventBus.emit('job.engagementCheck');
    });
    logger.info('📊 Engagement check job scheduled (daily at midnight)');

    // 👇 GROWTH/RETENTION JOB SCHEDULES
    scheduler.registerJob('dailyRetention', '0 20 * * *', dailyRetention);
    scheduler.registerJob('weeklyGrowthReport', '0 9 * * 1', weeklyGrowthReport);
    scheduler.registerJob('inactivityCheck', '0 10 * * 0', inactivityCheck);
    logger.info('📈 Growth/Retention jobs scheduled');

    // 👇 OPTIMIZATION JOB SCHEDULES
    scheduler.registerJob('healthCheck', '*/15 * * * *', healthCheck);
    scheduler.registerJob('cacheCleanup', '*/30 * * * *', cacheCleanup);
    scheduler.registerJob('memoryMonitor', '*/10 * * * *', memoryMonitor);
    scheduler.registerJob('logRotation', '0 0 * * *', logRotation);
    scheduler.registerJob('tempCleanup', '0 0 * * 0', tempCleanup);
    scheduler.registerJob('performanceReport', '0 20 * * 0', performanceReport);
    logger.info('⚡ Optimization jobs scheduled');

    // 👇 CONTENT PLANNING JOB SCHEDULES
    scheduler.registerJob('dailyContent', '0 9 * * *', dailyContent);
    scheduler.registerJob('educationalContent', '0 */6 * * *', educationalContent);
    scheduler.registerJob('marketRecap', '0 20 * * *', marketRecap);
    scheduler.registerJob('engagementContent', '0 */12 * * *', engagementContent);
    scheduler.registerJob('announcementReminder', '0 */4 * * *', announcementReminder);
    scheduler.registerJob('vipContent', '0 10 * * *', vipContent);
    scheduler.registerJob('premiumContent', '0 12 * * *', premiumContent);
    logger.info('📅 Content planning jobs scheduled');

    // 👇 AMA JOB SCHEDULE
    scheduler.registerJob('amasummary', '0 20 * * 0', amaSummary);
    logger.info('🎙️ AMA summary job scheduled (Sunday 8 PM UTC)');

    // 👇 SELF-IMPROVEMENT JOB SCHEDULES
    scheduler.registerJob('performanceAnalysis', '0 */6 * * *', performanceAnalysis);
    scheduler.registerJob('feedbackMining', '0 * * * *', feedbackMining);
    scheduler.registerJob('trendDetection', '0 0 * * *', trendDetection);
    scheduler.registerJob('sentimentAnalysis', '0 */6 * * *', sentimentAnalysis);
    scheduler.registerJob('suggestionReport', '0 20 * * 0', suggestionReport);
    logger.info('🧠 Self-improvement jobs scheduled');

    // 👇 TRIAL EXPIRY JOB SCHEDULE (every hour)
    scheduler.registerJob('trialExpiry', '0 * * * *', trialExpiry);
    logger.info('⏰ Trial expiry job scheduled (every hour)');

    // 👇 ENGAGEMENT JOB SCHEDULES
    scheduler.registerJob('conversationStarter', '0 9 * * *', conversationStarter);
    scheduler.registerJob('dailyPoll', '0 10 * * *', dailyPoll);
    scheduler.registerJob('dailyQuiz', '0 11 * * *', dailyQuiz);
    scheduler.registerJob('dailyDebate', '0 12 * * *', dailyDebate);
    scheduler.registerJob('trivia', '0 14 * * *', trivia);
    scheduler.registerJob('mentor', '0 15 * * *', mentor);
    scheduler.registerJob('autoSummarize', '*/10 * * * *', autoSummarize);
    logger.info('🎯 Engagement jobs scheduled');

    // 👇 SOCIAL FEED JOB SCHEDULE
    scheduler.registerJob('socialFeed', process.env.SOCIAL_FEED_INTERVAL || '*/30 * * * *', socialFeed);
    logger.info('📡 Social feed job scheduled');

    // Self‑ping job (keep Render awake)
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