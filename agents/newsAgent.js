const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const axios = require('axios');

class NewsAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.parser = new Parser();
    // Configuration
    this.defaultConfig = {
      updateIntervalMinutes: 10,
      maxItemsPerFeed: 5,
      feeds: {
        cryptoNews: [
          'https://cointelegraph.com/rss',
          'https://cryptoslate.com/feed/',
          'https://decrypt.co/feed',
        ],
        airdrops: [
          'https://cryptopanic.com/news/airdrop/feed/',
          'https://airdrops.io/feed/',
        ],
        bitcoinNews: ['https://news.bitcoin.com/feed/'],
        altcoinNews: ['https://cryptopotato.com/feed/'],
      },
      reddit: {
        enabled: false,
        subreddits: ['cryptocurrency', 'bitcoin', 'ethereum'],
        limit: 5,
      },
    };
    this.guildConfigs = new Map(); // per-guild: { outputChannels, subscriptions }
    this.lastPostCache = new Map(); // feedUrl -> last item link
    this.subscriptions = new Map(); // guildId -> Set of category strings (e.g., 'cryptoNews', 'airdrops')
  }

  async init() {
    await super.init();
    await this.initDatabase();
    this.subscribe('job.newsUpdate', async () => {
      await this.fetchAllNews();
    });
    this.logger.info('NewsAgent ready');
  }

  async initDatabase() {
    const db = this.deps.db;
    db.run(`CREATE TABLE IF NOT EXISTS news_subscriptions (
      guildId TEXT,
      category TEXT,
      channelId TEXT,
      PRIMARY KEY (guildId, category)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS news_cache (
      feedUrl TEXT,
      lastItemLink TEXT,
      lastPostAt INTEGER,
      PRIMARY KEY (feedUrl)
    )`);
    // Load existing subscriptions from DB
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT guildId, category, channelId FROM news_subscriptions`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    for (const row of rows) {
      if (!this.subscriptions.has(row.guildId)) this.subscriptions.set(row.guildId, new Map());
      this.subscriptions.get(row.guildId).set(row.category, row.channelId);
    }
    // Load cache
    const cacheRows = await new Promise((resolve, reject) => {
      db.all(`SELECT feedUrl, lastItemLink FROM news_cache`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    for (const row of cacheRows) {
      this.lastPostCache.set(row.feedUrl, row.lastItemLink);
    }
  }

  // ---------- FETCH NEWS FROM ALL SOURCES ----------
  async fetchAllNews() {
    const config = await this.getGlobalConfig();
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
      const feed = await this.parser.parseURL(feedUrl);
      const lastPosted = this.lastPostCache.get(feedUrl);
      const newItems = [];
      for (const item of feed.items.slice(0, this.defaultConfig.maxItemsPerFeed)) {
        if (!lastPosted || item.link !== lastPosted) {
          newItems.push(item);
        } else {
          break; // assuming RSS is in order
        }
      }
      if (newItems.length > 0) {
        // Reverse to post oldest first
        newItems.reverse();
        for (const item of newItems) {
          await this.sendNews(item, category);
        }
        // Update cache with latest item
        const latestLink = feed.items[0]?.link;
        if (latestLink) {
          this.lastPostCache.set(feedUrl, latestLink);
          await this.saveCacheToDb(feedUrl, latestLink);
        }
      }
    } catch (err) {
      this.logger.error(`RSS fetch error for ${feedUrl}: ${err.message}`);
    }
  }

  async sendNews(item, category) {
    // Find all guilds subscribed to this category
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
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [embed] }).catch(err => this.logger.error(`Failed to send news: ${err.message}`));
        }
      }
    }
    this.eventBus.emit('news.published', { category, title: item.title, link: item.link });
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

  // ---------- REDDIT INTEGRATION (optional) ----------
  async fetchReddit() {
    const config = await this.getGlobalConfig();
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
        if (channel) await channel.send({ embeds: [embed] });
      }
    }
  }

  async saveCacheToDb(feedUrl, lastItemLink) {
    const db = this.deps.db;
    db.run(`INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [feedUrl, lastItemLink, Date.now()]);
  }

  // ---------- SLASH COMMANDS ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName, options, guild, channel } = interaction;

    switch (commandName) {
      case 'subscribe':
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
    const validCategories = Object.keys(this.defaultConfig.feeds);
    validCategories.push('reddit');
    if (!validCategories.includes(category)) {
      return interaction.reply({ content: `Invalid category. Choose: ${validCategories.join(', ')}`, ephemeral: true });
    }
    if (!this.subscriptions.has(interaction.guild.id)) {
      this.subscriptions.set(interaction.guild.id, new Map());
    }
    this.subscriptions.get(interaction.guild.id).set(category, channelTarget.id);
    // Save to DB
    const db = this.deps.db;
    db.run(`INSERT OR REPLACE INTO news_subscriptions (guildId, category, channelId) VALUES (?, ?, ?)`,
      [interaction.guild.id, category, channelTarget.id]);
    await interaction.reply({ content: `✅ Subscribed to **${category}** in ${channelTarget}.`, ephemeral: true });
  }

  async cmdUnsubscribe(interaction) {
    const category = interaction.options.getString('category');
    if (!this.subscriptions.has(interaction.guild.id) ||
        !this.subscriptions.get(interaction.guild.id).has(category)) {
      return interaction.reply({ content: `Not subscribed to ${category}.`, ephemeral: true });
    }
    this.subscriptions.get(interaction.guild.id).delete(category);
    const db = this.deps.db;
    db.run(`DELETE FROM news_subscriptions WHERE guildId = ? AND category = ?`, [interaction.guild.id, category]);
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

  async getGlobalConfig() {
    // Could be extended to per-guild custom feeds
    return this.defaultConfig;
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = NewsAgent;