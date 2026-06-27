/**
 * 🎁 AirdropAgent v6.1 (Configurable)
 * - Fetches airdrop announcements from configurable RSS feeds
 * - Posts exclusive airdrop alerts to a VIP/Premium channel
 * - Includes "Claim" button, rich embed with image
 * - Deduplication via DB cache
 * - AI-powered summary (if SummaryAgent is available)
 * - Configurable post limit, filters, colors, texts
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Parser = require('rss-parser');

class AirdropAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Parser with configurable User-Agent ----
    const userAgent = process.env.AIRDROP_USER_AGENT || 'Ultra3VaultBot/1.0';
    this.parser = new Parser({
      timeout: parseInt(process.env.AIRDROP_TIMEOUT_MS) || 10000,
      headers: { 'User-Agent': userAgent },
    });

    // ---- Feeds (comma-separated) ----
    const defaultFeeds = [
      'https://airdrops.io/feed/',
      'https://cryptopotato.com/category/airdrops/feed/',
      'https://cointelegraph.com/tags/airdrop/feed',
      'https://coinmarketcal.com/feed/airdrop',
      'https://airdropalert.com/feed',
    ];
    const envFeeds = process.env.AIRDROP_FEEDS;
    this.feeds = envFeeds ? envFeeds.split(',').map(u => u.trim()) : defaultFeeds;

    // ---- Filter keywords (comma-separated) ----
    const defaultFilter = ['sponsor', 'partner', 'advertisement'];
    const envFilter = process.env.AIRDROP_FILTER_KEYWORDS;
    this.filterKeywords = envFilter ? envFilter.split(',').map(k => k.trim().toLowerCase()) : defaultFilter;

    // ---- Limits ----
    this.maxPostsPerCycle = parseInt(process.env.MAX_AIRDROPS_PER_CYCLE) || 3;

    // ---- Embed customization ----
    this.embedColor = parseInt(process.env.AIRDROP_EMBED_COLOR) || 0xffaa00;
    this.footerText = process.env.AIRDROP_FOOTER_TEXT || '💎 VIP/Premium Exclusive – Limited availability!';
    this.buttonLabel = process.env.AIRDROP_BUTTON_LABEL || '🚀 Claim Airdrop';
    this.fallbackDescription = process.env.AIRDROP_FALLBACK_DESCRIPTION || 'Click the button to learn more.';

    // ---- Cache ----
    this.lastPostCache = new Map();
    this.postedLinks = new Set();
  }

  async init() {
    await super.init();
    await this._loadCacheFromDb();
    this.subscribe('job.airdropCheck', async () => {
      this.logger.debug('🎁 Checking for new airdrops...');
      await this._checkAirdrops();
    });
    this.logger.info(`🎁 AirdropAgent v6.1 ready (feeds: ${this.feeds.length}, filter: ${this.filterKeywords.join(', ')})`);
  }

  // ---------- Cache Helpers ----------
  async _loadCacheFromDb() {
    try {
      const rows = await this.db.all(
        `SELECT feedUrl, lastItemLink FROM news_cache WHERE feedUrl LIKE 'airdrop:%'`
      );
      for (const row of rows) {
        this.lastPostCache.set(row.feedUrl, row.lastItemLink);
        this.postedLinks.add(row.lastItemLink);
      }
      this.logger.debug(`Loaded ${this.lastPostCache.size} airdrop cache entries`);
    } catch (err) {
      this.logger.warn(`Could not load airdrop cache: ${err.message}`);
    }
  }

  async _saveCacheToDb(feedUrl, lastLink) {
    const key = `airdrop:${feedUrl}`;
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, lastLink, Date.now()]
    ).catch(err => this.logger.error(`Failed to save cache: ${err.message}`));
  }

  // ---------- Main Job ----------
  async _checkAirdrops() {
    const channelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!channelId) {
      this.logger.debug('No PREMIUM_AIRDROP_CHANNEL_ID set – skipping airdrop check');
      return;
    }
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`Airdrop channel ${channelId} not found or not text-based`);
      return;
    }

    let postedCount = 0;
    const allNewItems = [];

    for (const feedUrl of this.feeds) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const items = feed.items || [];
        const lastPosted = this.lastPostCache.get(feedUrl);

        const newItems = items.filter(item => item.link !== lastPosted);
        if (newItems.length === 0) continue;

        for (const item of newItems.slice(0, 5)) {
          if (this.postedLinks.has(item.link)) continue;
          if (this.filterKeywords.some(kw => item.title?.toLowerCase().includes(kw))) continue;

          allNewItems.push({ ...item, feedUrl });
          this.postedLinks.add(item.link);
        }

        if (newItems.length > 0) {
          const latestLink = newItems[0].link;
          this.lastPostCache.set(feedUrl, latestLink);
          await this._saveCacheToDb(feedUrl, latestLink);
        }
      } catch (err) {
        this.logger.error(`Airdrop feed error (${feedUrl}): ${err.message}`);
      }
    }

    allNewItems.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));

    for (const item of allNewItems.slice(0, this.maxPostsPerCycle)) {
      await this._sendAirdrop(channel, item);
      postedCount++;
    }

    if (postedCount > 0) {
      this.logger.info(`🎁 Posted ${postedCount} new airdrop${postedCount > 1 ? 's' : ''}`);
    }
  }

  // ---------- Send Airdrop Embed ----------
  async _sendAirdrop(channel, item) {
    // Extract image
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

    // AI summary (optional)
    let summary = null;
    const summaryAgent = this.deps.orchestrator?.getAgent('SummaryAgent');
    if (summaryAgent && typeof summaryAgent.summarize === 'function') {
      try {
        const text = `${item.title || ''}. ${item.contentSnippet || item.content || ''}`;
        summary = await summaryAgent.summarize(text, 30, 'crypto airdrop');
      } catch (err) {
        this.logger.debug(`AI summary failed: ${err.message}`);
      }
    }

    const description = summary || item.contentSnippet || item.content || this.fallbackDescription;

    const embed = new EmbedBuilder()
      .setTitle(`🎁 ${item.title || 'Airdrop'}`)
      .setURL(item.link || 'https://example.com')
      .setDescription(description)
      .setColor(this.embedColor)
      .setTimestamp(new Date(item.isoDate || Date.now()))
      .setFooter({ text: this.footerText });

    if (image) embed.setImage(image);

    const sourceName = item.source?.name || item.creator || item.author || 'Unknown';
    embed.addFields({ name: '📡 Source', value: sourceName, inline: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(this.buttonLabel)
        .setStyle(ButtonStyle.Link)
        .setURL(item.link || 'https://example.com')
    );

    await channel.send({ embeds: [embed], components: [row] })
      .catch(err => this.logger.error(`Failed to send airdrop: ${err.message}`));
  }
}

module.exports = AirdropAgent;