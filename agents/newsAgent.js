/**
 * 📰 NewsAgent v5.0 (Stable – auto‑subscribes to all categories)
 * - Fetches RSS feeds (crypto, airdrops, bitcoin, altcoin)
 * - Auto‑subscribes to all categories on startup using DEFAULT_NEWS_CHANNEL_ID
 * - Handles malformed responses gracefully
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const axios = require('axios');

class NewsAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.parser = new Parser();
    this.defaultConfig = {
      updateIntervalMinutes: 10,
      maxItemsPerFeed: 5,
      feeds: {
        cryptoNews: [
          'https://cointelegraph.com/rss',
        ],
        airdrops: [
          'https://cointelegraph.com/tags/airdrop/feed',
        ],
        bitcoinNews: ['https://news.bitcoin.com/feed/'],
        altcoinNews: ['https://cryptopotato.com/feed/'],
      },
      reddit: {
        enabled: false,   // enable if you want Reddit posts
        subreddits: ['cryptocurrency', 'bitcoin', 'ethereum'],
        limit: 5,
      },
    };
    this.lastPostCache = new Map();
    this.subscriptions = new Map();
  }

  async init() {
    await super.init();
    await this.loadSubscriptionsAndCache();
    await this.ensureDefaultSubscriptions(); // 👈 auto‑subscribe to all categories
    this.subscribe('job.newsUpdate', async () => {
      this.logger.debug('🔄 News job triggered – fetching all news');
      await this.fetchAllNews();
    });
    this.logger.info('📰 NewsAgent ready');
  }

  /**
   * Auto‑subscribe to ALL categories using the default channel ID.
   */
  async ensureDefaultSubscriptions() {
    const defaultChannelId = process.env.DEFAULT_NEWS_CHANNEL_ID;
    if (!defaultChannelId) {
      this.logger.debug('No DEFAULT_NEWS_CHANNEL_ID set – skipping auto‑subscription');
      return;
    }
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const existing = this.subscriptions.get(guild.id);
    if (existing && existing.size > 0) {
      this.logger.debug(`Guild ${guild.id} already has subscriptions – not auto‑subscribing`);
      return;
    }

    const channel = this.client.channels.cache.get(defaultChannelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Default news channel ${defaultChannelId} not found or not text‑based`);
      return;
    }

    // All available categories (excluding 'reddit' unless you enable it)
    const allCategories = ['cryptoNews', 'airdrops', 'bitcoinNews', 'altcoinNews'];
    // Optionally add 'reddit' if you want Reddit posts
    // const allCategories = ['cryptoNews', 'airdrops', 'bitcoinNews', 'altcoinNews', 'reddit'];

    for (const category of allCategories) {
      if (!this.subscriptions.has(guild.id)) this.subscriptions.set(guild.id, new Map());
      this.subscriptions.get(guild.id).set(category, defaultChannelId);
      await this.db.run(
        `INSERT OR REPLACE INTO news_subscriptions (guildId, category, channelId) VALUES (?, ?, ?)`,
        [guild.id, category, defaultChannelId]
      );
      this.logger.info(`✅ Auto-subscribed ${category} to ${channel.name} (${defaultChannelId})`);
    }
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

  async fetchAllNews() {
    const config = this.defaultConfig;
    for (const [category, feedUrls] of Object.entries(config.feeds)) {
      for (const feedUrl of feedUrls) {
        await this.fetchFeed(feedUrl, category);
      }
    }
    if (config.reddit.enabled) {
      await this.fetchReddit();
    }
  }

  async fetchFeed(feedUrl, category) {
    try {
      this.logger.debug(`📡 Fetching RSS: ${feedUrl} (${category})`);
      const feed = await this.parser.parseURL(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ultra3VaultBot/1.0; +https://ultra3vault-bot.onrender.com)' }
      });
      if (!feed.items || !Array.isArray(feed.items)) {
        this.logger.warn(`Feed ${feedUrl} returned no items array`);
        return;
      }
      const lastPosted = this.lastPostCache.get(feedUrl);
      const newItems = [];
      for (const item of feed.items.slice(0, this.defaultConfig.maxItemsPerFeed)) {
        if (!lastPosted || item.link !== lastPosted) {
          newItems.push(item);
        } else {
          break;
        }
      }
      if (newItems.length) {
        this.logger.info(`📰 Found ${newItems.length} new items for ${feedUrl}`);
        newItems.reverse();
        for (const item of newItems) {
          await this.sendNews(item, category);
        }
        const latestLink = feed.items[0]?.link;
        if (latestLink) {
          this.lastPostCache.set(feedUrl, latestLink);
          await this.saveCacheToDb(feedUrl, latestLink);
        }
      } else {
        this.logger.debug(`No new items for ${feedUrl}`);
      }
    } catch (err) {
      this.logger.error(`❌ RSS fetch error for ${feedUrl} (${category}): ${err.message}`);
    }
  }

  async sendNews(item, category) {
    const embed = new EmbedBuilder()
      .setTitle(item.title || 'News')
      .setURL(item.link)
      .setDescription(item.contentSnippet || item.content || 'No description')
      .setColor(this.getCategoryColor(category))
      .setFooter({ text: `Category: ${category} • ${new Date(item.isoDate || Date.now()).toLocaleString()}` });
    if (item.enclosure?.url) embed.setImage(item.enclosure.url);
    for (const [guildId, subs] of this.subscriptions.entries()) {
      const channelId = subs.get(category);
      if (channelId) {
        const channel = this.client.channels.cache.get(channelId);
        if (!channel) {
          this.logger.warn(`Channel ${channelId} not found in cache for category ${category}`);
          continue;
        }
        if (!channel.isTextBased()) {
          this.logger.warn(`Channel ${channelId} is not text‑based`);
          continue;
        }
        await channel.send({ embeds: [embed] }).catch(err => {
          this.logger.error(`Failed to send news to ${channelId}: ${err.message}`);
        });
      }
    }
    this.emit('news.published', { category, title: item.title, link: item.link });
  }

  getCategoryColor(category) {
    const colors = {
      cryptoNews: 0x1e88e5,
      airdrops: 0x43a047,
      bitcoinNews: 0xf9a825,
      altcoinNews: 0x8e24aa,
    };
    return colors[category] || 0x607d8b;
  }

  // ---------- REDDIT (optional, unchanged) ----------
  async fetchReddit() {
    const config = this.defaultConfig;
    const subreddits = config.reddit.subreddits;
    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=${config.reddit.limit}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'DiscordBot/1.0' } });
        const posts = res.data.data.children;
        for (const post of posts) {
          const data = post.data;
          const feedUrl = `reddit:${sub}`;
          const lastPosted = this.lastPostCache.get(feedUrl);
          if (!lastPosted || data.name !== lastPosted) {
            await this.sendRedditPost(data, sub);
            this.lastPostCache.set(feedUrl, data.name);
            await this.saveCacheToDb(feedUrl, data.name);
          } else {
            break;
          }
        }
      } catch (err) {
        this.logger.error(`Reddit fetch error for r/${sub}: ${err.message}`);
      }
    }
  }

  async sendRedditPost(post, subreddit) {
    const embed = new EmbedBuilder()
      .setTitle(post.title)
      .setURL(`https://reddit.com${post.permalink}`)
      .setDescription(post.selftext?.slice(0, 200) || '')
      .addFields(
        { name: '👍 Upvotes', value: post.score.toString(), inline: true },
        { name: '💬 Comments', value: post.num_comments.toString(), inline: true },
        { name: 'Subreddit', value: `r/${subreddit}`, inline: true }
      )
      .setColor(0xff4500)
      .setFooter({ text: `Posted by u/${post.author}` });
    if (post.url && (post.url.endsWith('.jpg') || post.url.endsWith('.png'))) embed.setImage(post.url);
    for (const [guildId, subs] of this.subscriptions.entries()) {
      const channelId = subs.get('reddit');
      if (channelId) {
        const channel = this.client.channels.cache.get(channelId);
        if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  async saveCacheToDb(feedUrl, lastItemLink) {
    await this.db.run(`INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [feedUrl, lastItemLink, Date.now()]).catch(() => {});
  }

  // ---------- SLASH COMMANDS (unchanged) ----------
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
    await this.db.run(`INSERT OR REPLACE INTO news_subscriptions (guildId, category, channelId) VALUES (?, ?, ?)`,
      [interaction.guild.id, category, channelTarget.id]);
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
      return interaction.reply({ content: 'No active news subscriptions in this server.', ephemeral: true });
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
    const category = interaction.options.getString('category') || 'cryptoNews';
    const mockItem = {
      title: 'Test News Article',
      link: 'https://example.com',
      contentSnippet: 'This is a test news post from your bot.',
      isoDate: new Date().toISOString(),
    };
    await this.sendNews(mockItem, category);
    await interaction.reply({ content: 'Test news sent.', ephemeral: true });
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = NewsAgent;