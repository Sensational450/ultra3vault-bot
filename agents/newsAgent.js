/**
 * 📰 NewsAgent v6.0 (Configurable)
 * - Fetches crypto news from: GNews → NewsData.io → Currents API → RSS (fallback)
 * - All API keys and endpoints are configurable via env
 * - Auto‑subscribes to a default channel
 * - Emits 'news.published' for every new article
 * - Listens to 'news.important' and sends only high‑value news (if AlertPrioritizationAgent is active)
 * - Uses configurable embed colors, footer, button label
 * - Fixed cmdSubscribe category list
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const Parser = require('rss-parser');

class NewsAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- API Keys ----
    this.gnewsKey = process.env.GNEWS_API_KEY;
    this.newsdataKey = process.env.NEWSDATA_API_KEY;
    this.currentsKey = process.env.CURRENTS_API_KEY;

    // ---- Config ----
    this.fallbackRssUrl = process.env.NEWS_RSS_FALLBACK_URL || 'https://cointelegraph.com/rss';
    this.footerText = process.env.NEWS_FOOTER_TEXT || 'Ultra3Vault News • Category: {category}';
    this.buttonLabel = process.env.NEWS_BUTTON_LABEL || 'Read full article';
    this.authorIconUrl = process.env.NEWS_AUTHOR_ICON_URL || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    this.embedColors = this._parseEmbedColors(process.env.NEWS_EMBED_COLORS) || {
      Cointelegraph: 0x1a1e24,
      GNews: 0x00ae86,
      'NewsData.io': 0x3498db,
      'Currents API': 0x9b59b6,
      default: 0x1e88e5,
    };

    // Categories (for /subscribe command) – configurable via env
    this.validCategories = (process.env.NEWS_CATEGORIES || 'cryptoNews,reddit,defi,nft')
      .split(',').map(c => c.trim());

    // Caches
    this.lastPostCache = new Map();
    this.subscriptions = new Map();

    // Prioritization flag (default false)
    this.usePrioritization = process.env.USE_ALERT_PRIORITIZATION === 'true';
  }

  async init() {
    await super.init();
    await this.loadSubscriptionsAndCache();
    await this.ensureDefaultSubscriptions();

    this.subscribe('job.newsUpdate', async () => {
      this.logger.debug('🔄 News job triggered – fetching news');
      await this.fetchAndEmitNews();
    });

    this.subscribe('news.important', async ({ item, category }) => {
      this.logger.debug(`📨 Received important news: ${item.title}`);
      for (const [guildId, subs] of this.subscriptions.entries()) {
        const channelId = subs.get(category);
        if (channelId) {
          await this.sendNews(item, guildId, channelId, category);
        }
      }
    });

    this.logger.info(`📰 NewsAgent v6.0 ready (fallback: ${this.fallbackRssUrl})`);
  }

  // ---------- Helper: Parse embed colors from env ----------
  _parseEmbedColors(envString) {
    if (!envString) return null;
    try {
      const parsed = JSON.parse(envString);
      // Convert hex strings to numbers
      const result = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = typeof value === 'string' ? parseInt(value.replace('#', ''), 16) : value;
      }
      return result;
    } catch {
      return null;
    }
  }

  // ---------- Subscriptions ----------
  async ensureDefaultSubscriptions() {
    const defaultChannelId = process.env.DEFAULT_NEWS_CHANNEL_ID;
    if (!defaultChannelId) return;
    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    const existing = this.subscriptions.get(guild.id);
    if (existing && existing.size > 0) return;
    const channel = this.client.channels.cache.get(defaultChannelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Default news channel ${defaultChannelId} not found`);
      return;
    }
    const category = 'cryptoNews';
    if (!this.subscriptions.has(guild.id)) this.subscriptions.set(guild.id, new Map());
    this.subscriptions.get(guild.id).set(category, defaultChannelId);
    await this.db.run(
      `INSERT OR REPLACE INTO news_subscriptions (guildId, category, channelId) VALUES (?, ?, ?)`,
      [guild.id, category, defaultChannelId]
    );
    this.logger.info(`✅ Auto-subscribed ${category} to ${channel.name}`);
  }

  async loadSubscriptionsAndCache() {
    try {
      const subsRows = await this.db.all(`SELECT guildId, category, channelId FROM news_subscriptions`);
      this.subscriptions.clear();
      for (const row of subsRows) {
        if (!this.subscriptions.has(row.guildId)) this.subscriptions.set(row.guildId, new Map());
        this.subscriptions.get(row.guildId).set(row.category, row.channelId);
      }
      const cacheRows = await this.db.all(`SELECT feedUrl, lastItemLink FROM news_cache`);
      this.lastPostCache.clear();
      for (const row of cacheRows) {
        this.lastPostCache.set(row.feedUrl, row.lastItemLink);
      }
    } catch (err) {
      this.logger.warn(`Could not load news data: ${err.message}`);
    }
  }

  // ---------- Fetch News ----------
  async fetchNews() {
    // 1️⃣ GNews API
    if (this.gnewsKey) {
      try {
        const url = `https://gnews.io/api/v4/search?q=cryptocurrency&lang=en&max=5&token=${this.gnewsKey}`;
        const response = await axios.get(url, { timeout: 10000 });
        const articles = response.data?.articles || [];
        if (articles.length) {
          this.logger.debug('✅ Fetched news from GNews');
          return articles.map(a => ({
            title: a.title,
            link: a.url,
            description: a.description || '',
            source: a.source?.name || 'GNews',
            publishedAt: a.publishedAt,
            image: a.image || null,
          }));
        } else {
          this.logger.warn('GNews returned no articles');
        }
      } catch (err) {
        this.logger.error(`GNews API error: ${err.message}`);
      }
    }

    // 2️⃣ NewsData.io API
    if (this.newsdataKey) {
      try {
        const url = `https://newsdata.io/api/1/news?apikey=${this.newsdataKey}&q=cryptocurrency&language=en&size=5`;
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data?.results?.length) {
          this.logger.debug('✅ Fetched news from NewsData.io');
          return response.data.results.map(a => ({
            title: a.title,
            link: a.link,
            description: a.description || '',
            source: a.source_id || 'NewsData.io',
            publishedAt: a.pubDate,
            image: a.image_url || null,
          }));
        } else {
          this.logger.warn('NewsData.io returned no articles');
        }
      } catch (err) {
        this.logger.error(`NewsData.io error: ${err.message}`);
      }
    }

    // 3️⃣ Currents API
    if (this.currentsKey) {
      try {
        const url = `https://api.currentsapi.services/v1/latest-news?apiKey=${this.currentsKey}&language=en&keywords=cryptocurrency&limit=5`;
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data?.news?.length) {
          this.logger.debug('✅ Fetched news from Currents API');
          return response.data.news.map(a => ({
            title: a.title,
            link: a.url,
            description: a.description || '',
            source: a.author || 'Currents API',
            publishedAt: a.published,
            image: null,
          }));
        } else {
          this.logger.warn('Currents API returned no articles');
        }
      } catch (err) {
        this.logger.error(`Currents API error: ${err.message}`);
      }
    }

    // 4️⃣ RSS fallback
    try {
      const parser = new Parser({
        timeout: 10000,
        headers: { 'User-Agent': process.env.NEWS_USER_AGENT || 'Ultra3VaultBot/1.0' },
      });
      const feed = await parser.parseURL(this.fallbackRssUrl);
      this.logger.debug('✅ Fetched news from RSS fallback');
      return feed.items.slice(0, 5).map(item => {
        let image = null;
        if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
          image = item.enclosure.url;
        } else if (item.media?.content?.[0]?.url) {
          image = item.media.content[0].url;
        } else if (item['media:content']?.['$']?.url) {
          image = item['media:content']['$'].url;
        } else if (item.image?.url) {
          image = item.image.url;
        } else if (item.thumbnail) {
          image = item.thumbnail;
        }
        return {
          title: item.title,
          link: item.link,
          description: item.contentSnippet || '',
          source: 'RSS',
          publishedAt: item.isoDate,
          image,
        };
      });
    } catch (err) {
      this.logger.error(`RSS fallback error: ${err.message}`);
      return [];
    }
  }

  // ---------- Fetch and Emit ----------
  async fetchAndEmitNews() {
    const articles = await this.fetchNews();
    if (!articles.length) {
      this.logger.debug('No articles from any source');
      return;
    }

    if (!this.usePrioritization) {
      // Send all articles directly
      for (const [guildId, subs] of this.subscriptions.entries()) {
        for (const [category, channelId] of subs.entries()) {
          const cacheKey = `${guildId}:${category}`;
          const lastLink = this.lastPostCache.get(cacheKey);
          const newArticle = articles.find(a => a.link !== lastLink);
          if (!newArticle) continue;
          await this.sendNews(newArticle, guildId, channelId, category);
          this.lastPostCache.set(cacheKey, newArticle.link);
          await this.saveCacheToDb(cacheKey, newArticle.link);
        }
      }
    } else {
      // Emit for AlertPrioritizationAgent to filter
      for (const article of articles) {
        let alreadyPosted = false;
        for (const [guildId, subs] of this.subscriptions.entries()) {
          for (const [category] of subs.entries()) {
            const cacheKey = `${guildId}:${category}`;
            if (this.lastPostCache.get(cacheKey) === article.link) {
              alreadyPosted = true;
              break;
            }
          }
          if (alreadyPosted) break;
        }
        if (alreadyPosted) continue;
        let firstCategory = null;
        for (const [, subs] of this.subscriptions.entries()) {
          for (const [category] of subs.entries()) {
            firstCategory = category;
            break;
          }
          if (firstCategory) break;
        }
        if (!firstCategory) continue;
        this.emit('news.published', { item: article, category: firstCategory });
        if (!this._emittedCache) this._emittedCache = new Map();
        this._emittedCache.set(article.link, Date.now());
      }
    }
  }

  // ---------- Send News ----------
  async sendNews(article, guildId, channelId, category) {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Channel ${channelId} not found or not text-based`);
      return;
    }

    const color = this.embedColors[article.source] || this.embedColors.default || 0x1e88e5;

    const footer = this.footerText.replace(/{category}/g, category || 'General');

    const embed = new EmbedBuilder()
      .setTitle(article.title || 'Crypto News')
      .setURL(article.link)
      .setDescription(article.description || '')
      .setColor(color)
      .setTimestamp(new Date(article.publishedAt))
      .setAuthor({ name: article.source || 'Unknown', iconURL: this.authorIconUrl })
      .setFooter({ text: footer });

    if (article.image) embed.setImage(article.image);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(this.buttonLabel)
        .setStyle(ButtonStyle.Link)
        .setURL(article.link)
    );

    await channel.send({ embeds: [embed], components: [row] }).catch(err => this.logger.error(`Failed to send: ${err.message}`));
  }

  // ---------- Cache ----------
  async saveCacheToDb(key, value) {
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, value, Date.now()]
    ).catch(() => {});
  }

  // ---------- Slash Commands ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    switch (commandName) {
      case 'subscribe':
      case 'newssubscribe':
        await this.cmdSubscribe(interaction);
        break;
      case 'unsubscribe':
        await this.cmdUnsubscribe(interaction);
        break;
      case 'listsubs':
        await this.cmdListSubs(interaction);
        break;
      case 'testnews':
        if (!interaction.member.permissions.has('Administrator')) return this.deny(interaction);
        await this.cmdTestNews(interaction);
        break;
    }
  }

  async cmdSubscribe(interaction) {
    const category = interaction.options.getString('category');
    const channelTarget = interaction.options.getChannel('channel') || interaction.channel;
    if (!channelTarget.isTextBased()) return interaction.reply({ content: 'Must be a text channel.', ephemeral: true });
    if (!this.validCategories.includes(category)) {
      return interaction.reply({
        content: `Invalid category. Choose: ${this.validCategories.join(', ')}`,
        ephemeral: true,
      });
    }
    if (!this.subscriptions.has(interaction.guild.id)) this.subscriptions.set(interaction.guild.id, new Map());
    this.subscriptions.get(interaction.guild.id).set(category, channelTarget.id);
    await this.db.run(
      `INSERT OR REPLACE INTO news_subscriptions (guildId, category, channelId) VALUES (?, ?, ?)`,
      [interaction.guild.id, category, channelTarget.id]
    );
    await interaction.reply({ content: `✅ Subscribed to **${category}** in ${channelTarget}.`, ephemeral: true });
  }

  async cmdUnsubscribe(interaction) {
    const category = interaction.options.getString('category');
    if (!this.subscriptions.has(interaction.guild.id) || !this.subscriptions.get(interaction.guild.id).has(category)) {
      return interaction.reply({ content: `Not subscribed to ${category}.`, ephemeral: true });
    }
    this.subscriptions.get(interaction.guild.id).delete(category);
    await this.db.run(`DELETE FROM news_subscriptions WHERE guildId = ? AND category = ?`, [interaction.guild.id, category]);
    await interaction.reply({ content: `✅ Unsubscribed from **${category}**.`, ephemeral: true });
  }

  async cmdListSubs(interaction) {
    const subs = this.subscriptions.get(interaction.guild.id);
    if (!subs || subs.size === 0) {
      return interaction.reply({ content: 'No active news subscriptions.', ephemeral: true });
    }
    let desc = '';
    for (const [cat, chId] of subs.entries()) {
      const channel = interaction.guild.channels.cache.get(chId);
      desc += `• **${cat}** → ${channel ? channel.toString() : 'deleted channel'}\n`;
    }
    const embed = new EmbedBuilder().setTitle('📰 News Subscriptions').setDescription(desc).setColor(0x3498db);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async cmdTestNews(interaction) {
    const mockItem = {
      title: 'Test News Article',
      link: 'https://example.com',
      description: 'This is a test news post from your bot.',
      source: 'Ultra3Vault Test',
    };
    const category = interaction.options.getString('category') || 'cryptoNews';
    const channelId = this.subscriptions.get(interaction.guild.id)?.get(category);
    if (!channelId) {
      return interaction.reply({ content: `No subscription for ${category}. Run /newssubscribe first.`, ephemeral: true });
    }
    await this.sendNews(mockItem, interaction.guild.id, channelId, category);
    await interaction.reply({ content: 'Test news sent.', ephemeral: true });
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = NewsAgent;