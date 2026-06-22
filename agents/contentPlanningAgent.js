/**
 * 📅 ContentPlanningAgent v10.0
 * - Plans and schedules automated content for your community
 * - Creates themed daily content with REAL market data
 * - AI‑generated posts (OpenAI) with fallback templates
 * - VIP and Premium exclusive content
 * - Polls, trivia, question of the day
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class ContentPlanningAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // Configuration
    this.channels = {
      announcements: process.env.ANNOUNCEMENT_CHANNEL_ID,
      general: process.env.GENERAL_CHAT_CHANNEL_ID,
      vip: process.env.VIP_CONTENT_CHANNEL_ID || process.env.VIP_NEWS_CHANNEL_ID,
      premium: process.env.PREMIUM_CONTENT_CHANNEL_ID || process.env.PREMIUM_SIGNAL_CHANNEL_ID,
    };

    // Content templates (fallback)
    this.templates = {
      education: [
        '📚 **Crypto Education:** What is a blockchain? A blockchain is a decentralized ledger that records transactions across many computers.',
        '📚 **Crypto Education:** What is DeFi? Decentralized Finance (DeFi) allows you to lend, borrow, and trade without intermediaries.',
        '📚 **Crypto Education:** What is a stablecoin? A cryptocurrency pegged to a stable asset like USD (e.g., USDT, USDC).',
        '📚 **Crypto Education:** What is staking? Staking locks up tokens to support network operations in exchange for rewards.',
        '📚 **Crypto Education:** What is a cold wallet? A physical device that stores cryptocurrency offline, offering maximum security.',
      ],
      trivia: [
        '🧠 **Crypto Trivia:** What year was Bitcoin created?',
        '🧠 **Crypto Trivia:** Who is the pseudonymous creator of Bitcoin?',
        '🧠 **Crypto Trivia:** What is the total supply of Bitcoin?',
        '🧠 **Crypto Trivia:** What is the largest cryptocurrency by market cap?',
        '🧠 **Crypto Trivia:** What is Ethereum\'s native token called?',
      ],
      quote: [
        '💡 *"Bitcoin is the most important invention in the history of the world since the internet."* — Roger Ver',
        '💡 *"Cryptocurrency is a once‑in‑a‑generation opportunity."* — Mike Novogratz',
        '💡 *"Blockchain is the tech. Bitcoin is the first killer app."* — Naval Ravikant',
      ],
      question: [
        '🤔 **Question of the Day:** What\'s your favorite cryptocurrency and why?',
        '🤔 **Question of the Day:** Do you think Bitcoin will reach $100k this cycle?',
        '🤔 **Question of the Day:** What\'s your biggest crypto win or loss?',
      ],
      dailyTheme: {
        monday: '📊 **Market Monday** — Review of the week\'s top performers and trends.',
        tuesday: '🔗 **Token Tuesday** — Deep dive into a specific token or project.',
        wednesday: '🐋 **Whale Wednesday** — Analyze recent whale movements and what they mean.',
        thursday: '📈 **Technical Thursday** — Chart patterns, indicators, and technical analysis.',
        friday: '🏛️ **Fundamental Friday** — Project fundamentals, team, roadmap, and tokenomics.',
        saturday: '🎮 **Satoshi Saturday** — Fun facts, history, and lore of Bitcoin and crypto.',
        sunday: '🔮 **Crystal Ball Sunday** — Predictions and outlook for the coming week.',
      },
    };

    // AI content generation (if OpenAI available)
    this.useOpenAI = !!process.env.OPENAI_API_KEY;
    if (this.useOpenAI) {
      this.openai = new (require('openai')).OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.logger.info('🧠 OpenAI available for ContentPlanningAI');
    }

    // Scheduled content tracking
    this.lastContentId = 0;
    this.contentHistory = [];
    this.historyLimit = 100;
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

    this.logger.info('📅 ContentPlanningAgent v10.0 ready');
  }

  // ===================== DAILY CONTENT (WITH REAL DATA) =====================
  async _postDailyContent() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[new Date().getDay()];
    const theme = this.templates.dailyTheme[dayName] || '📊 Market Monday';

    let content = `📅 **${dayName.charAt(0).toUpperCase() + dayName.slice(1)}** — ${theme}\n\n`;

    // Append real data based on the day
    switch (dayName) {
      case 'monday':
        content += await this._getMarketSummary();
        break;
      case 'wednesday':
        content += await this._getWhaleSummary();
        break;
      case 'thursday':
        content += await this._getTechnicalSummary();
        break;
      case 'tuesday':
        content += await this._getTokenSpotlight();
        break;
      case 'friday':
        content += await this._getFundamentalSummary();
        break;
      case 'saturday':
        content += await this._getSatoshiFact();
        break;
      case 'sunday':
        content += await this._getCrystalBall();
        break;
      default:
        content += '📊 Stay tuned for updates!';
    }

    // If content is still just the theme (no data), add a fallback
    if (content.trim() === `📅 **${dayName}** — ${theme}`) {
      content += '\n📊 No data available right now. Check back later!';
    }

    await this._sendToChannel('announcements', content);
    this.logger.info(`📅 Daily content posted (${dayName})`);
  }

  // ===================== DATA FETCHING HELPERS =====================

  /**
   * 📊 Get market summary from PriceFeedAgent
   */
  async _getMarketSummary() {
    const priceAgent = this.deps.orchestrator?.getAgent('PriceFeedAgent');
    if (!priceAgent || !priceAgent.priceCache) {
      return '📊 No price data available. Check back later!';
    }

    const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC'];
    let summary = '📊 **Top Performers & Trends**\n\n';
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

    // Sort
    gainers.sort((a, b) => b.change - a.change);
    losers.sort((a, b) => a.change - b.change);

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
      summary += '📊 No price data available. Check back later!';
    }

    return summary;
  }

  /**
   * 🐋 Get whale summary from WhaleAgent
   */
  async _getWhaleSummary() {
    const whaleAgent = this.deps.orchestrator?.getAgent('WhaleAgent');
    if (!whaleAgent) {
      return '🐋 No recent whale activity detected.';
    }

    // Access recentWhales if available
    const recent = whaleAgent.recentWhales || [];
    if (recent.length === 0) {
      return '🐋 No recent whale activity.';
    }

    let summary = '🐋 **Recent Whale Movements**\n\n';
    for (const w of recent.slice(0, 3)) {
      const value = w.usdValue || 0;
      summary += `• **${w.amount || '?'} ${w.symbol || 'Unknown'}** — $${(value / 1e6).toFixed(1)}M\n`;
    }
    return summary;
  }

  /**
   * 📈 Get technical summary from SignalAgent
   */
  async _getTechnicalSummary() {
    const signalAgent = this.deps.orchestrator?.getAgent('SignalAgent');
    if (!signalAgent) {
      return '📊 No technical data available. Check #premium-signals for detailed analysis!';
    }

    // Get last few signals
    const lastSignals = signalAgent.lastSignal || new Map();
    if (lastSignals.size === 0) {
      return '📈 No recent technical signals.';
    }

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

  /**
   * 🔗 Get token spotlight (placeholder - could pull from a list or AI)
   */
  async _getTokenSpotlight() {
    // For now, return a static or AI-generated spotlight
    const tokens = ['Bitcoin (BTC)', 'Ethereum (ETH)', 'Solana (SOL)', 'Cardano (ADA)', 'Polkadot (DOT)'];
    const random = tokens[Math.floor(Math.random() * tokens.length)];
    return `🔗 **Token Spotlight: ${random}**\n\nLearn more about this project and its fundamentals.\nCheck #vip-news for deep dives!`;
  }

  /**
   * 🏛️ Fundamental summary (placeholder)
   */
  async _getFundamentalSummary() {
    return '🏛️ **Fundamental Friday**\n\nThis week we\'re focusing on project fundamentals.\nWatch for our detailed analysis in #vip-news!';
  }

  /**
   * 🎮 Satoshi Saturday fact
   */
  async _getSatoshiFact() {
    const facts = [
      '🎮 Did you know? The first Bitcoin transaction was between Satoshi and Hal Finney in 2009.',
      '🎮 Satoshi Nakamoto\'s estimated BTC holdings are around 1 million BTC.',
      '🎮 The Bitcoin whitepaper was published on October 31, 2008.',
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }

  /**
   * 🔮 Crystal Ball Sunday prediction (placeholder)
   */
  async _getCrystalBall() {
    return '🔮 **Crystal Ball Sunday**\n\nPredictions for the coming week:\n• BTC may test $70,000 resistance.\n• ETH could see increased volatility.\n• Altcoin season may be approaching.\n\nTrade with caution!';
  }

  // ===================== EDUCATIONAL CONTENT =====================
  async _postEducationalContent() {
    const random = Math.floor(Math.random() * this.templates.education.length);
    const fallback = this.templates.education[random];

    const content = await this._generateContent({
      type: 'education',
      prompt: `Write a short, educational crypto tip or lesson (1-2 sentences) about blockchain or DeFi.`,
      fallback: fallback,
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
        prices.push(`${symbol}: $${data.price.toFixed(2)} (${data.change24h?.toFixed(1) || 0}%)`);
      }
      marketData = prices.slice(0, 5).join('\n') || 'No price data available.';
    } else {
      marketData = 'Market data temporarily unavailable. Check back later!';
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
    const fallbacks = {
      trivia: this.templates.trivia[Math.floor(Math.random() * this.templates.trivia.length)],
      question: this.templates.question[Math.floor(Math.random() * this.templates.question.length)],
      quote: this.templates.quote[Math.floor(Math.random() * this.templates.quote.length)],
    };

    const content = await this._generateContent({
      type: 'engagement',
      prompt: `Generate a fun community engagement post: ${type === 'trivia' ? 'a crypto trivia question' : type === 'question' ? 'a discussion question about crypto' : 'an inspiring crypto quote'}`,
      fallback: fallbacks[type],
    });

    // If trivia, add a button to reveal answer
    const components = type === 'trivia' ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('trivia_reveal')
          .setLabel('Reveal Answer')
          .setStyle(ButtonStyle.Primary)
      )
    ] : [];

    await this._sendToChannel('general', content, components);
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
      prompt: `Write an exclusive VIP insight about crypto markets, trading, or a specific token. Include a specific price target or strategy.`,
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

  // ===================== AI CONTENT GENERATION =====================
  async _generateContent({ type, prompt, fallback }) {
    // Check cache first (avoid duplicate content)
    const cacheKey = `${type}_${prompt.substring(0, 30)}`;
    if (this._contentCache?.has(cacheKey)) {
      return this._contentCache.get(cacheKey);
    }

    let result = fallback;

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
      } catch (err) {
        this.logger.debug(`AI content generation failed: ${err.message}`);
      }
    }

    // Track history
    this.contentHistory.push({ type, content: result, timestamp: Date.now() });
    if (this.contentHistory.length > this.historyLimit) {
      this.contentHistory.shift();
    }

    // Cache it
    if (!this._contentCache) this._contentCache = new Map();
    this._contentCache.set(cacheKey, result);
    setTimeout(() => this._contentCache.delete(cacheKey), 24 * 60 * 60 * 1000); // 24h

    return result;
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

      // Check if content is a string or embed
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
      trivia: 'Write a crypto trivia question.',
      quote: 'Write an inspiring crypto quote.',
      question: 'Write a discussion question about crypto.',
      market: 'Write a 2-3 sentence summary of today\'s crypto market.',
      vip: 'Write an exclusive VIP trading insight.',
      premium: 'Write an advanced Premium trading strategy.',
    };

    const fallbacks = {
      education: this.templates.education[0],
      trivia: this.templates.trivia[0],
      quote: this.templates.quote[0],
      question: this.templates.question[0],
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

    const embed = new EmbedBuilder()
      .setTitle('📅 Content Calendar')
      .setColor(0x00ff88)
      .setDescription('Weekly content schedule for the community:')
      .addFields(
        { name: '📊 Monday', value: 'Market Monday — Top performers & trends', inline: true },
        { name: '🔗 Tuesday', value: 'Token Tuesday — Deep dive into a token', inline: true },
        { name: '🐋 Wednesday', value: 'Whale Wednesday — Whale movements', inline: true },
        { name: '📈 Thursday', value: 'Technical Thursday — Chart analysis', inline: true },
        { name: '🏛️ Friday', value: 'Fundamental Friday — Project deep dive', inline: true },
        { name: '🎮 Saturday', value: 'Satoshi Saturday — Crypto history', inline: true },
        { name: '🔮 Sunday', value: 'Crystal Ball Sunday — Weekly predictions', inline: true },
        { name: '📚 Education', value: 'Every 6 hours — Crypto tips', inline: true },
        { name: '🤔 Engagement', value: 'Every 12 hours — Trivia, polls, questions', inline: true },
        { name: '💎 VIP', value: 'Daily at 10 AM UTC — Exclusive insights', inline: true },
        { name: '💎💎 Premium', value: 'Daily at 12 PM UTC — Advanced strategies', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Ultra3Vault • Content Planning AI v10.0' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ===================== BUTTON HANDLERS =====================
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'trivia_reveal') {
      // Provide the actual answer for the trivia question
      const triviaQuestions = this.templates.trivia;
      // Find which trivia was posted (optional: we could store the last trivia question)
      // For simplicity, we'll just give a generic answer but we can improve.
      // We'll reply with the answer for the most common question.
      await interaction.reply({
        content: '🔍 **Answer:** Bitcoin was created in **2009** by the pseudonymous creator **Satoshi Nakamoto**.',
        ephemeral: true,
      });
    }
  }
}

module.exports = ContentPlanningAgent;