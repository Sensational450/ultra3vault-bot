/**
 * 📰 NewsAgent v5.0 (Multi‑API + RSS fallback with real images)
 * - Fetches crypto news from: GNews → NewsData.io → Currents API → RSS (Cointelegraph)
 * - Requires API keys: GNEWS_API_KEY, NEWSDATA_API_KEY, CURRENTS_API_KEY (optional)
 * - Auto‑subscribes to cryptoNews using DEFAULT_NEWS_CHANNEL_ID
 * - Enhanced sendNews with "Read More" button and large image
 * - Supports all categories: cryptoNews, airdrops, bitcoinNews, altcoinNews, reddit
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const Parser = require('rss-parser');

class NewsAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.gnewsKey = process.env.GNEWS_API_KEY;
    this.newsdataKey = process.env.NEWSDATA_API_KEY;
    this.currentsKey = process.env.CURRENTS_API_KEY;
    this.fallbackRssUrl = 'https://cointelegraph.com/rss';
    this.lastPostCache = new Map();
    this.subscriptions = new Map();
  }

  async init() {
    await super.init();
    await this.loadSubscriptionsAndCache();
    await this.ensureDefaultSubscriptions();
    this.subscribe('job.newsUpdate', async () => {
      this.logger.debug('🔄 News job triggered – fetching news');
      await this.fetchAndSendNews();
    });
    this.logger.info('📰 NewsAgent ready (multi‑API + RSS fallback)');
  }

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

  /**
   * Fetch news from multiple sources in priority order:
   * 1. GNews API (if key exists)
   * 2. NewsData.io API (if key exists)
   * 3. Currents API (if key exists)
   * 4. Cointelegraph RSS (fallback) with real image extraction
   */
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

    // 4️⃣ RSS fallback (Cointelegraph) - extract real images
    try {
      const parser = new Parser();
      const feed = await parser.parseURL(this.fallbackRssUrl, {
        headers: { 'User-Agent': 'Ultra3VaultBot/1.0' }
      });
      this.logger.debug('✅ Fetched news from RSS fallback (Cointelegraph)');
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
          source: 'Cointelegraph',
          publishedAt: item.isoDate,
          image,
        };
      });
    } catch (err) {
      this.logger.error(`RSS fallback error: ${err.message}`);
      return [];
    }
  }

  async fetchAndSendNews() {
    const articles = await this.fetchNews();
    if (!articles.length) {
      this.logger.debug('No articles from any source');
      return;
    }
    for (const [guildId, subs] of this.subscriptions.entries()) {
      // For each guild, iterate over all subscribed categories
      for (const [category, channelId] of subs.entries()) {
        const cacheKey = `${guildId}:${category}`;
        const lastLink = this.lastPostCache.get(cacheKey);
        // Find first article from this category (all articles are general; we don't filter by category yet)
        // In a real implementation, you would filter articles by category if the API supported it.
        // For simplicity, we post the first new article to all subscribed categories.
        const newArticle = articles.find(a => a.link !== lastLink);
        if (!newArticle) continue;
        await this.sendNews(newArticle, guildId, channelId, category);
        this.lastPostCache.set(cacheKey, newArticle.link);
        await this.saveCacheToDb(cacheKey, newArticle.link);
      }
    }
  }

  async sendNews(article, guildId, channelId, category) {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Channel ${channelId} not found or not text-based`);
      return;
    }

    let color = 0x1e88e5;
    if (article.source === 'Cointelegraph') color = 0x1a1e24;
    if (article.source === 'GNews') color = 0x00ae86;
    if (article.source === 'NewsData.io') color = 0x3498db;
    if (article.source === 'Currents API') color = 0x9b59b6;

    const embed = new EmbedBuilder()
      .setTitle(article.title || 'Crypto News')
      .setURL(article.link)
      .setDescription(article.description || '')
      .setColor(color)
      .setTimestamp(new Date(article.publishedAt))
      .setAuthor({ name: article.source, iconURL: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' })
      .setFooter({ text: `Ultra3Vault News • Category: ${category}` });

    if (article.image) embed.setImage(article.image);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Read full article')
        .setStyle(ButtonStyle.Link)
        .setURL(article.link)
    );

    await channel.send({ embeds: [embed], components: [row] }).catch(err => this.logger.error(`Failed to send: ${err.message}`));
  }

  async saveCacheToDb(key, value) {
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, value, Date.now()]
    ).catch(() => {});
  }

  // ---------- SLASH COMMANDS ----------
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
    const validCategories = [...Object.keys(this.defaultConfig.feeds), 'reddit'];
    if (!validCategories.includes(category)) {
      return interaction.reply({ content: `Invalid category. Choose: ${validCategories.join(', ')}`, ephemeral: true });
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