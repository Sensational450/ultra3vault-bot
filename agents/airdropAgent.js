/**
 * 🎁 AirdropAgent v6.0 (Upgraded)
 * - Fetches airdrop announcements from multiple RSS feeds
 * - Posts exclusive airdrop alerts to a VIP/Premium channel
 * - Includes "Claim" button, rich embed with image
 * - Deduplication via DB cache
 * - AI-powered summary (if SummaryAgent is available)
 * - Configurable post limit per cycle
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Parser = require('rss-parser');

class AirdropAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.parser = new Parser({
      timeout: 10000,
      headers: { 'User-Agent': 'Ultra3VaultBot/1.0' },
    });

    // Expanded feed list
    this.feeds = [
      'https://airdrops.io/feed/',
      'https://cryptopotato.com/category/airdrops/feed/',
      'https://cointelegraph.com/tags/airdrop/feed',
      'https://coinmarketcal.com/feed/airdrop',      // optional
      'https://airdropalert.com/feed',               // optional
    ];

    // Cache: feedUrl → last posted link (stored in DB)
    this.lastPostCache = new Map();
    this.postedLinks = new Set();  // in-memory dedup for current run

    // Config
    this.maxPostsPerCycle = parseInt(process.env.MAX_AIRDROPS_PER_CYCLE) || 3;
    this.filterKeywords = ['sponsor', 'partner', 'advertisement']; // skip these
  }

  async init() {
    await super.init();
    await this._loadCacheFromDb();
    this.subscribe('job.airdropCheck', async () => {
      this.logger.debug('🎁 Checking for new airdrops...');
      await this._checkAirdrops();
    });
    // Also listen to summary agent if available
    this.logger.info('🎁 AirdropAgent v6.0 ready');
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
        // Parse feed using async/await (fixed)
        const feed = await this.parser.parseURL(feedUrl);
        const items = feed.items || [];
        const lastPosted = this.lastPostCache.get(feedUrl);

        // Filter new items (since we store last link per feed)
        const newItems = items.filter(item => item.link !== lastPosted);
        if (newItems.length === 0) continue;

        // Take the newest ones (already in descending order)
        for (const item of newItems.slice(0, 5)) {
          // Skip if already posted globally
          if (this.postedLinks.has(item.link)) continue;
          // Skip if contains filter keywords
          if (this.filterKeywords.some(kw => item.title.toLowerCase().includes(kw))) continue;

          allNewItems.push({ ...item, feedUrl });
          this.postedLinks.add(item.link);
        }

        // Update cache for this feed with the latest link
        if (newItems.length > 0) {
          const latestLink = newItems[0].link;
          this.lastPostCache.set(feedUrl, latestLink);
          await this._saveCacheToDb(feedUrl, latestLink);
        }
      } catch (err) {
        this.logger.error(`Airdrop feed error (${feedUrl}): ${err.message}`);
      }
    }

    // Sort all new items by published date (newest first)
    allNewItems.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));

    // Post up to maxPostsPerCycle
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
    // Try to extract image
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

    // Attempt to generate a summary via SummaryAgent (if available)
    let summary = null;
    const summaryAgent = this.deps.orchestrator?.getAgent('SummaryAgent');
    if (summaryAgent && typeof summaryAgent.summarize === 'function') {
      try {
        const text = `${item.title}. ${item.contentSnippet || item.content || ''}`;
        summary = await summaryAgent.summarize(text, 30, 'crypto airdrop');
      } catch (err) {
        this.logger.debug(`AI summary failed: ${err.message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎁 ${item.title}`)
      .setURL(item.link)
      .setDescription(summary || item.contentSnippet || item.content || 'Click the button to learn more.')
      .setColor(0xffaa00)
      .setTimestamp(new Date(item.isoDate || Date.now()))
      .setFooter({ text: '💎 VIP/Premium Exclusive – Limited availability!' });

    if (image) embed.setImage(image);

    // Add source field
    const sourceName = item.source?.name || item.creator || item.author || 'Unknown';
    embed.addFields({ name: '📡 Source', value: sourceName, inline: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🚀 Claim Airdrop')
        .setStyle(ButtonStyle.Link)
        .setURL(item.link)
    );

    await channel.send({ embeds: [embed], components: [row] })
      .catch(err => this.logger.error(`Failed to send airdrop: ${err.message}`));
  }
}

module.exports = AirdropAgent;