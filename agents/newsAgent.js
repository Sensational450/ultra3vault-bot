/**
 * 📰 NewsAgent v5.0 (API‑based, direct Axios)
 * - Fetches crypto news directly from cryptocurrency.cv API
 * - Auto‑subscribes to cryptoNews using DEFAULT_NEWS_CHANNEL_ID
 * - Safe error handling – never crashes
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class NewsAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.apiUrl = 'https://api.cryptocurrency.cv/latest?limit=5';
    this.lastPostCache = new Map();   // key = `${guildId}:${category}` -> last posted link
    this.subscriptions = new Map();   // guildId -> Map(category -> channelId)
  }

  async init() {
    await super.init();
    await this.loadSubscriptionsAndCache();
    await this.ensureDefaultSubscriptions();
    this.subscribe('job.newsUpdate', async () => {
      this.logger.debug('🔄 News job triggered – fetching from API');
      await this.fetchAndSendNews();
    });
    this.logger.info('📰 NewsAgent ready (direct API)');
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

  async fetchAndSendNews() {
    try {
      const response = await axios.get(this.apiUrl, { timeout: 10000 });
      const articles = response.data?.data || [];
      if (!articles.length) {
        this.logger.debug('No articles from API');
        return;
      }
      // For each subscription, post the latest unseen article
      for (const [guildId, subs] of this.subscriptions.entries()) {
        const channelId = subs.get('cryptoNews');
        if (!channelId) continue;
        const cacheKey = `${guildId}:cryptoNews`;
        const lastLink = this.lastPostCache.get(cacheKey);
        const newArticle = articles.find(a => a.link !== lastLink);
        if (!newArticle) continue;
        await this.sendNews(newArticle, guildId, channelId);
        this.lastPostCache.set(cacheKey, newArticle.link);
        await this.saveCacheToDb(cacheKey, newArticle.link);
      }
    } catch (err) {
      this.logger.error(`❌ News API error: ${err.message}`);
    }
  }

  async sendNews(article, guildId, channelId) {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Channel ${channelId} not found or not text-based`);
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(article.title || 'Crypto News')
      .setURL(article.link)
      .setDescription(article.description || article.contentSnippet || '')
      .setColor(0x1e88e5)
      .setFooter({ text: `Source: ${article.source || 'cryptocurrency.cv'} • ${new Date().toLocaleString()}` });
    if (article.image) embed.setImage(article.image);
    await channel.send({ embeds: [embed] }).catch(err => this.logger.error(`Failed to send: ${err.message}`));
  }

  async saveCacheToDb(key, value) {
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, value, Date.now()]
    ).catch(() => {});
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
    if (category !== 'cryptoNews') {
      return interaction.reply({ content: 'Only `cryptoNews` category is supported.', ephemeral: true });
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
    const category = 'cryptoNews';
    const channelId = this.subscriptions.get(interaction.guild.id)?.get(category);
    if (!channelId) {
      return interaction.reply({ content: 'No subscription. Run `/newssubscribe` first.', ephemeral: true });
    }
    await this.sendNews(mockItem, interaction.guild.id, channelId);
    await interaction.reply({ content: 'Test news sent.', ephemeral: true });
  }

  deny(interaction) {
    interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
  }
}

module.exports = NewsAgent;