/**
 * 🎁 AirdropAgent v5.0
 * - Fetches airdrop announcements from multiple RSS feeds (airdrops.io, etc.)
 * - Posts exclusive airdrop alerts to a VIP/Premium channel
 * - Includes "Claim" button and rich embed
 * - Deduplication via last-posted link cache (stored in DB)
 * - Scheduled via `job.airdropCheck` event
 * - Safe error handling – never crashes
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Parser = require('rss-parser');

class AirdropAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
    this.parser = new Parser();
    // Primary sources – curated list of reliable airdrop feeds
    this.feeds = [
      'https://airdrops.io/feed/',                 // Best overall
      'https://cryptopotato.com/category/airdrops/feed/', // Alternative
      'https://cointelegraph.com/tags/airdrop/feed',      // Major news source
    ];
    // Cache: feedUrl -> last posted link (persisted in DB)
    this.lastPostCache = new Map();
  }

  async init() {
    await super.init();
    // Load cache from DB (if exists)
    await this.loadCacheFromDb();
    // Listen for scheduled event
    this.subscribe('job.airdropCheck', async () => {
      this.logger.debug('🎁 Checking for new airdrops...');
      await this.checkAirdrops();
    });
    this.logger.info('🎁 AirdropAgent ready (VIP/Premium only)');
  }

  /**
   * Load last posted link per feed from DB (news_cache table, reusing existing schema)
   */
  async loadCacheFromDb() {
    try {
      const rows = await this.db.all(
        `SELECT feedUrl, lastItemLink FROM news_cache WHERE feedUrl LIKE 'airdrop:%'`
      );
      for (const row of rows) {
        this.lastPostCache.set(row.feedUrl, row.lastItemLink);
      }
      this.logger.debug(`Loaded ${this.lastPostCache.size} airdrop cache entries`);
    } catch (err) {
      this.logger.warn(`Could not load airdrop cache: ${err.message}`);
    }
  }

  /**
   * Save last posted link to DB
   */
  async saveCacheToDb(feedUrl, lastLink) {
    const key = `airdrop:${feedUrl}`;
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, lastLink, Date.now()]
    ).catch(err => this.logger.error(`Failed to save cache: ${err.message}`));
  }

  /**
   * Main job: check all feeds for new airdrops
   */
  async checkAirdrops() {
    const vipChannelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!vipChannelId) {
      this.logger.debug('No PREMIUM_AIRDROP_CHANNEL_ID set – skipping airdrop check');
      return;
    }
    const channel = this.client.channels.cache.get(vipChannelId);
    if (!channel || !channel.isTextBased()) {
      this.logger.warn(`VIP airdrop channel ${vipChannelId} not found or not text-based`);
      return;
    }

    for (const feedUrl of this.feeds) {
      try {
        const feed = await this.parser.parseURL(feedUrl, {
          headers: { 'User-Agent': 'Ultra3VaultBot/1.0' },
          timeout: 10000,
        });
        const lastPosted = this.lastPostCache.get(feedUrl);
        // Find new items (feed items are in descending order)
        const newItems = feed.items.filter(item => item.link !== lastPosted);
        if (newItems.length === 0) continue;

        // Post the most recent new airdrop (first item)
        const latest = newItems[0];
        await this.sendAirdrop(channel, latest, feedUrl);
        // Update cache
        this.lastPostCache.set(feedUrl, latest.link);
        await this.saveCacheToDb(feedUrl, latest.link);
        // Only one per cycle to avoid spam – break after first new airdrop
        break;
      } catch (err) {
        this.logger.error(`Airdrop fetch error for ${feedUrl}: ${err.message}`);
      }
    }
  }

  /**
   * Send formatted airdrop embed to channel
   */
  async sendAirdrop(channel, item, feedUrl) {
    const embed = new EmbedBuilder()
      .setTitle(`🎁 New Airdrop: ${item.title}`)
      .setURL(item.link)
      .setDescription(item.contentSnippet || item.content || 'Click the button to learn more.')
      .setColor(0xffaa00)
      .setTimestamp(new Date(item.isoDate || Date.now()))
      .setFooter({ text: '💎 VIP Exclusive – Limited availability!' });

    // Add a "Claim" button (link)
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