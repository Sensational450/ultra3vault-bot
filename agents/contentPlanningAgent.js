/**
 * 📅 ContentPlanningAgent v12.1 (AI‑Only with Gemini Fallback)
 * - All content is dynamically generated via OpenAI (primary)
 * - Falls back to Google Gemini if OpenAI fails
 * - Real data from agents (price, whale, signals)
 * - Caches AI responses for 24h to reduce cost
 * - Generic fallbacks only as last resort
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // ✅ Correct SDK

class ContentPlanningAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // Channels
    this.channels = {
      announcements: process.env.ANNOUNCEMENT_CHANNEL_ID,
      general: process.env.GENERAL_CHAT_CHANNEL_ID,
      vip: process.env.VIP_CONTENT_CHANNEL_ID || process.env.VIP_NEWS_CHANNEL_ID,
      premium: process.env.PREMIUM_CONTENT_CHANNEL_ID || process.env.PREMIUM_SIGNAL_CHANNEL_ID,
    };

    // ---- OpenAI ----
    this.useOpenAI = !!process.env.OPENAI_API_KEY;
    if (this.useOpenAI) {
      this.openai = new (require('openai')).OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.logger.info('🧠 OpenAI available for ContentPlanningAI');
    } else {
      this.logger.warn('⚠️ OpenAI not available.');
    }

    // ---- Gemini (Fallback) ----
    this.useGemini = !!process.env.GEMINI_API_KEY;
    if (this.useGemini) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      this.logger.info(`🧠 Gemini available (model: ${this.geminiModel})`);
    } else {
      this.logger.warn('⚠️ Gemini not available.');
    }

    // Cache for AI responses (24h TTL)
    this._contentCache = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000;

    // Track last trivia question (to avoid duplicate button issue)
    this.lastTriviaQuestion = null;
  }

  async init() {
    await super.init();

    // Subscribe to scheduled jobs
    this.subscribe('job.dailyContent', async () => {
      await this._postDailyContent();
    });
    this.subscribe('job.educationalContent', async () => {
      await this._postEducationalContent();
    });
    this.subscribe('job.marketRecap', async () => {
      await this._postMarketRecap();
    });
    this.subscribe('job.engagementContent', async () => {
      await this._postEngagementContent();
    });
    this.subscribe('job.announcementReminder', async () => {
      await this._postAnnouncementReminder();
    });
    this.subscribe('job.vipContent', async () => {
      await this._postVIPContent();
    });
    this.subscribe('job.premiumContent', async () => {
      await this._postPremiumContent();
    });

    this.logger.info('📅 ContentPlanningAgent v12.1 ready (OpenAI + Gemini)');
  }

  // ===================== DAILY CONTENT =====================
  async _postDailyContent() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[new Date().getDay()];
    const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);

    const themeContent = await this._generateContent({
      type: 'dailyTheme',
      prompt: `Write a short, engaging community post for "${dayCapitalized}" with a crypto theme. The post should be 2-3 sentences, informative, and encourage discussion.`,
      fallback: `📅 **${dayCapitalized}** — Stay tuned for today's crypto insights!`,
    });

    let dataSection = '';
    switch (dayName) {
      case 'monday':
        dataSection = await this._getMarketSummary();
        break;
      case 'wednesday':
        dataSection = await this._getWhaleSummary();
        break;
      case 'thursday':
        dataSection = await this._getTechnicalSummary();
        break;
      default:
        dataSection = '';
    }

    let content = themeContent;
    if (dataSection) {
      content += '\n\n' + dataSection;
    }

    await this._sendToChannel('announcements', content);
    this.logger.info(`📅 Daily content posted (${dayName})`);
  }

  // ===================== EDUCATIONAL CONTENT =====================
  async _postEducationalContent() {
    const content = await this._generateContent({
      type: 'education',
      prompt: `Write a short, educational crypto tip or lesson (1-2 sentences) about blockchain, DeFi, NFTs, or trading. Keep it clear and beginner-friendly.`,
      fallback: '📚 **Crypto Education:** Stay tuned for more tips!',
    });
    await this._sendToChannel('general', content);
    this.logger.info('📚 Educational content posted');
  }

  // ===================== MARKET RECAP =====================
  async _postMarketRecap() {
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    let marketData = '';
    if (priceAgent?.priceCache) {
      const prices = [];
      for (const [symbol, data] of priceAgent.priceCache) {
        if (data.price && data.change24h !== undefined) {
          prices.push(`${symbol}: $${data.price.toFixed(2)} (${data.change24h.toFixed(1)}%)`);
        }
      }
      marketData = prices.slice(0, 5).join('\n') || 'No price data available.';
    } else {
      marketData = 'Market data temporarily unavailable.';
    }

    const content = await this._generateContent({
      type: 'marketRecap',
      prompt: `Write a 2-3 sentence summary of today's crypto market based on:\n${marketData}\nBe concise and engaging.`,
      fallback: `📊 **Daily Market Recap**\n${marketData}\n\nStay tuned for more updates!`,
    });

    await this._sendToChannel('announcements', content);
    this.logger.info('📊 Market recap posted');
  }

  // ===================== ENGAGEMENT CONTENT =====================
  async _postEngagementContent() {
    const types = ['trivia', 'question', 'quote'];
    const type = types[Math.floor(Math.random() * types.length)];

    let prompt = '';
    let fallback = '';
    let components = [];

    if (type === 'trivia') {
      prompt = `Generate a crypto trivia question with a single correct answer. Format: "Question: ..." only.`;
      fallback = '🧠 **Crypto Trivia:** What is the native token of Ethereum?';
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('trivia_reveal')
            .setLabel('Reveal Answer')
            .setStyle(ButtonStyle.Primary)
        ),
      ];
      // Store answer for later (we could also ask AI for the answer)
      this.lastTriviaQuestion = 'Bitcoin was created in 2009 by Satoshi Nakamoto.';
    } else if (type === 'question') {
      prompt = `Generate a fun discussion question about crypto to engage a community. Format: "Question of the Day: ..."`;
      fallback = '🤔 **Question of the Day:** What\'s your favorite cryptocurrency and why?';
    } else if (type === 'quote') {
      prompt = `Generate an inspiring crypto quote. Format: "Quote: ... — Author"`;
      fallback = '💡 *"Bitcoin is the most important invention since the internet."* — Roger Ver';
    }

    const content = await this._generateContent({ type: 'engagement', prompt, fallback });

    if (type === 'trivia') {
      await this._sendToChannel('general', content + '\n\nClick the button to reveal the answer!', components);
    } else {
      await this._sendToChannel('general', content);
    }
    this.logger.info(`📝 Engagement content posted (${type})`);
  }

  // ===================== ANNOUNCEMENT REMINDER =====================
  async _postAnnouncementReminder() {
    const content = await this._generateContent({
      type: 'reminder',
      prompt: `Write a brief reminder for a recent important crypto announcement or event. Make it urgent but friendly.`,
      fallback: '📢 **Reminder:** Check out our latest announcements for important updates!',
    });
    await this._sendToChannel('general', content);
    this.logger.info('📢 Announcement reminder posted');
  }

  // ===================== VIP CONTENT =====================
  async _postVIPContent() {
    const content = await this._generateContent({
      type: 'vip',
      prompt: `Write an exclusive VIP insight about crypto markets, trading, or a specific token. Include a specific price target or strategy. Keep it concise and valuable.`,
      fallback: `💎 **VIP Insight**\n\nHere's an exclusive tip for our VIP members:\n• Watch BTC at resistance levels around $70,000.\n• Accumulate ETH on dips below $3,800.\n\nStay ahead!`,
    });
    await this._sendToChannel('vip', content);
    this.logger.info('💎 VIP content posted');
  }

  // ===================== PREMIUM CONTENT =====================
  async _postPremiumContent() {
    const content = await this._generateContent({
      type: 'premium',
      prompt: `Write an advanced trading or investment strategy for crypto. Include specific entry/exit points, risk management, and market analysis.`,
      fallback: `💎💎 **Premium Alpha**\n\nExclusive strategy for Premium members:\n• **Entry:** BTC $68,000 - $69,000\n• **Take Profit:** $74,000\n• **Stop Loss:** $66,000\n• **Risk:** 2% of portfolio\n\nTrade responsibly!`,
    });
    await this._sendToChannel('premium', content);
    this.logger.info('💎💎 Premium content posted');
  }

  // ===================== AI CONTENT GENERATION (with caching & Gemini fallback) =====================
  async _generateContent({ type, prompt, fallback }) {
    const cacheKey = `${type}_${prompt.substring(0, 40)}`;
    if (this._contentCache.has(cacheKey)) {
      const cached = this._contentCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.content;
      } else {
        this._contentCache.delete(cacheKey);
      }
    }

    let result = null;

    // 1. Try OpenAI
    if (this.useOpenAI) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a crypto community manager creating engaging Discord content.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 200,
          temperature: 0.8,
        });
        result = response.choices[0].message.content.trim();
        this.logger.debug(`✅ OpenAI success (${type})`);
      } catch (err) {
        this.logger.warn(`⚠️ OpenAI failed (${type}): ${err.message} – trying Gemini`);
      }
    }

    // 2. Try Gemini (if OpenAI failed)
    if (!result && this.useGemini) {
      try {
        result = await this._callGemini(prompt);
        this.logger.debug(`✅ Gemini success (${type})`);
      } catch (err) {
        this.logger.error(`❌ Gemini failed (${type}): ${err.message}`);
      }
    }

    // 3. Fallback (only if both fail)
    if (!result) {
      result = fallback;
      this.logger.warn(`⚠️ All AI providers failed – using fallback (${type})`);
    }

    // 4. Cache and return
    this._contentCache.set(cacheKey, { content: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Call Gemini with automatic retry on rate limits (429)
   * Uses the official @google/generative-ai SDK
   */
  async _callGemini(prompt, maxRetries = 2) {
    const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `You are a crypto community manager. ${prompt}` }] }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.8,
          },
        });
        return result.response.text();
      } catch (err) {
        lastError = err;
        this.logger.warn(`Gemini attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (err.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000; // exponential backoff
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError;
  }

  // ===================== DATA FETCHING HELPERS =====================
  async _getMarketSummary() {
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    if (!priceAgent || !priceAgent.priceCache) {
      return '📊 No price data available. Check back later!';
    }
    const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC'];
    let gainers = [];
    let losers = [];
    for (const [symbol, data] of priceAgent.priceCache.entries()) {
      if (!coins.includes(symbol)) continue;
      const change24h = data.change24h || 0;
      const price = data.price || 0;
      if (change24h > 0) {
        gainers.push({ symbol, price, change: change24h });
      } else {
        losers.push({ symbol, price, change: change24h });
      }
    }
    gainers.sort((a, b) => b.change - a.change);
    losers.sort((a, b) => a.change - b.change);

    let summary = '📊 **Top Performers & Trends**\n\n';
    if (gainers.length > 0) {
      summary += '🚀 **Top Gainers (24h):**\n';
      for (const g of gainers.slice(0, 3)) {
        summary += `• **${g.symbol}** — $${g.price.toFixed(2)} (📈 ${g.change.toFixed(1)}%)\n`;
      }
    }
    if (losers.length > 0) {
      summary += '\n📉 **Top Losers (24h):**\n';
      for (const l of losers.slice(0, 3)) {
        summary += `• **${l.symbol}** — $${l.price.toFixed(2)} (📉 ${l.change.toFixed(1)}%)\n`;
      }
    }
    if (gainers.length === 0 && losers.length === 0) {
      summary += '📊 No price data available.';
    }
    return summary;
  }

  async _getWhaleSummary() {
    const whaleAgent = this.deps.orchestrator?.getAgent('WhaleAgent');
    if (!whaleAgent) return '🐋 No recent whale activity detected.';
    const recent = whaleAgent.recentWhales || [];
    if (recent.length === 0) return '🐋 No recent whale activity.';
    let summary = '🐋 **Recent Whale Movements**\n\n';
    for (const w of recent.slice(0, 3)) {
      const value = w.usdValue || 0;
      summary += `• **${w.amount || '?'} ${w.symbol || 'Unknown'}** — $${(value / 1e6).toFixed(1)}M\n`;
    }
    return summary;
  }

  async _getTechnicalSummary() {
    const signalAgent = this.deps.orchestrator?.getAgent('SignalAgent');
    if (!signalAgent) return '📈 No recent technical signals.';
    const lastSignals = signalAgent.lastSignal || new Map();
    if (lastSignals.size === 0) return '📈 No recent signals.';
    let summary = '📈 **Recent Technical Signals**\n\n';
    let count = 0;
    for (const [key, timestamp] of lastSignals) {
      if (count >= 3) break;
      const parts = key.split('_');
      if (parts.length === 2) {
        const [coin, action] = parts;
        summary += `• **${coin}**: ${action} (${Math.round((Date.now() - timestamp) / 60000)} min ago)\n`;
        count++;
      }
    }
    if (count === 0) summary += '📈 No recent signals.';
    return summary;
  }

  // ===================== SEND TO CHANNEL =====================
  async _sendToChannel(channelKey, content, components = []) {
    const channelId = this.channels[channelKey];
    if (!channelId) {
      this.logger.warn(`⚠️ Channel "${channelKey}" not configured – skipping content`);
      return;
    }
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        this.logger.warn(`Channel ${channelId} not found or not text‑based`);
        return;
      }
      if (typeof content === 'string') {
        await channel.send({ content, components });
      } else {
        await channel.send({ embeds: [content], components });
      }
      this.logger.debug(`✅ Content sent to #${channel.name}`);
    } catch (err) {
      this.logger.error(`Failed to send to ${channelKey}: ${err.message}`);
    }
  }

  // ===================== SLASH COMMANDS =====================
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'postcontent':
        await this.cmdPostContent(interaction);
        break;
      case 'contentcalendar':
        await this.cmdContentCalendar(interaction);
        break;
    }
  }

  async cmdPostContent(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const type = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    await interaction.deferReply({ ephemeral: true });

    const prompts = {
      education: 'Write a short crypto education tip about blockchain or DeFi.',
      trivia: 'Generate a crypto trivia question.',
      quote: 'Generate an inspiring crypto quote.',
      question: 'Generate a discussion question about crypto.',
      market: 'Write a 2-3 sentence summary of today\'s crypto market.',
      vip: 'Write an exclusive VIP trading insight.',
      premium: 'Write an advanced Premium trading strategy.',
    };

    const fallbacks = {
      education: '📚 **Crypto Education:** Stay tuned for more tips!',
      trivia: '🧠 **Crypto Trivia:** What is the native token of Ethereum?',
      quote: '💡 *"In crypto, the only constant is change."*',
      question: '🤔 **Question of the Day:** What crypto project are you most excited about?',
      market: '📊 Market update: Check our price channel for latest data!',
      vip: '💎 VIP insight: Stay tuned for exclusive content!',
      premium: '💎💎 Premium alpha: Watch for our next signal!',
    };

    const content = await this._generateContent({
      type,
      prompt: prompts[type] || 'Generate engaging crypto content.',
      fallback: fallbacks[type] || '📢 Community update!',
    });

    await channel.send({ content });
    await interaction.editReply({ content: `✅ Content posted to ${channel}` });
  }

  async cmdContentCalendar(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const calendar = await this._generateContent({
      type: 'calendar',
      prompt: `Generate a weekly content calendar for a crypto community. List each day (Monday-Sunday) with a theme and a brief description. Format as a clean list.`,
      fallback: `📅 **Content Calendar**\n• Monday: Market Monday\n• Tuesday: Token Tuesday\n• Wednesday: Whale Wednesday\n• Thursday: Technical Thursday\n• Friday: Fundamental Friday\n• Saturday: Satoshi Saturday\n• Sunday: Crystal Ball Sunday`,
    });

    const embed = new EmbedBuilder()
      .setTitle('📅 Content Calendar')
      .setColor(0x00ff88)
      .setDescription(calendar)
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Content Planning AI v12.1' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ===================== BUTTON HANDLERS =====================
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'trivia_reveal') {
      const answer = this.lastTriviaQuestion || '🔍 Answer will be revealed soon!';
      await interaction.reply({
        content: `🔍 **Answer:** ${answer}`,
        ephemeral: true,
      });
    }
  }
}

module.exports = ContentPlanningAgent;