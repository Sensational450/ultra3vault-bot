/**
 * 📡 SocialFeedAgent v1.6 – Centralized Webhook Integration
 * - Fetches content from RSS feeds (Reddit, YouTube, Twitter, crypto news)
 * - Posts new items via "Netizen" webhook (key: 'socialFeed')
 * - Falls back to channel.send if webhook unavailable or fails
 * - Deduplicates via database, optional AI summarization
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const { sendWebhook } = require('../index'); // ✅ centralized helper

class SocialFeedAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Recommended Web3 + Social Feeds ----
    const defaultFeeds = [
      'https://decrypt.co/feed',
      'https://cointelegraph.com/rss',
      'https://nitter.net/VitalikButerin/rss',
      'https://nitter.net/cz_binance/rss',
      'https://www.reddit.com/r/CryptoCurrency/new/.rss',
      'https://www.youtube.com/feeds/videos.xml?playlist_id=UULVXuqSBlHAE6Xw-yeJA0Tunw',
    ];
    this.feeds = (process.env.SOCIAL_FEEDS || defaultFeeds.join(','))
      .split(',').map(u => u.trim()).filter(Boolean);

    this.channelId = process.env.SOCIAL_FEED_CHANNEL_ID; // fallback only

    // ---- Webhook display settings (optional) ----
    this.webhookUsername = process.env.SOCIAL_FEED_WEBHOOK_USERNAME || 'Netizen';
    this.webhookAvatar = process.env.SOCIAL_FEED_WEBHOOK_AVATAR || null;

    this.parser = new Parser({
      timeout: parseInt(process.env.SOCIAL_FEED_TIMEOUT_MS) || 10000,
      headers: {
        'User-Agent': process.env.SOCIAL_FEED_USER_AGENT || 'Ultra3VaultBot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    this.postedLinks = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000;
    this.maxPostsPerCycle = parseInt(process.env.SOCIAL_MAX_POSTS_PER_CYCLE) || 3;
    this.useSummary = process.env.SOCIAL_USE_SUMMARY !== 'false';
  }

  async init() {
    await super.init();
    await this._loadCacheFromDb();
    this.subscribe('job.socialFeed', async () => {
      try {
        await this._fetchAndPost();
      } catch (err) {
        this.logger.error(`SocialFeed job error: ${err.message}`);
      }
    });

    const hasWebhook = !!process.env.SOCIAL_FEED_WEBHOOK_URL;
    this.logger.info(`📡 SocialFeedAgent v1.6 ready (feeds: ${this.feeds.length}, webhook: ${hasWebhook ? '✅' : '❌'})`);
  }

  // ---------- Send via Webhook (centralized) with fallback ----------
  async _sendPost(embed) {
    // 1. Try centralized webhook
    try {
      await sendWebhook('socialFeed', { embeds: [embed] }, {
        username: this.webhookUsername,
        avatarURL: this.webhookAvatar || undefined,
      });
      this.logger.debug('✅ Social feed item sent via Netizen webhook');
      return;
    } catch (err) {
      this.logger.warn(`Webhook send failed: ${err.message}`);
    }

    // 2. Fallback to channel.send if webhook failed or was missing
    if (!this.channelId) {
      this.logger.warn('SOCIAL_FEED_CHANNEL_ID not set – cannot send');
      return;
    }
    const channel = this.client.channels.cache.get(this.channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Channel ${this.channelId} not found or not text-based`);
      return;
    }
    await channel.send({ embeds: [embed] });
    this.logger.debug('✅ Social feed item sent via channel.send fallback');
  }

  // ---------- Cache (unchanged) ----------
  async _loadCacheFromDb() {
    try {
      const rows = await this.db.all(`SELECT link, postedAt FROM social_feed_cache`);
      for (const row of rows) this.postedLinks.set(row.link, row.postedAt);
    } catch (err) {
      await this.db.exec(`CREATE TABLE IF NOT EXISTS social_feed_cache (link TEXT PRIMARY KEY, postedAt INTEGER)`);
    }
  }

  async _saveCache(link) {
    await this.db.run(`INSERT OR REPLACE INTO social_feed_cache (link, postedAt) VALUES (?, ?)`, [link, Date.now()])
      .catch(err => this.logger.error(`Cache save failed: ${err.message}`));
  }

  _cleanCache() {
    const now = Date.now();
    for (const [link, ts] of this.postedLinks) {
      if (now - ts > this.cacheTTL) this.postedLinks.delete(link);
    }
  }

  // ---------- Main job ----------
  async _fetchAndPost() {
    if (!this.channelId && !process.env.SOCIAL_FEED_WEBHOOK_URL) {
      this.logger.debug('No channel or webhook configured – skipping');
      return;
    }

    let postedCount = 0;
    const allItems = [];

    for (const feedUrl of this.feeds) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        for (const item of (feed.items || []).slice(0, 5)) {
          const link = item.link || item.url || item.guid;
          if (!link || this.postedLinks.has(link)) continue;
          allItems.push({ ...item, feedUrl, link });
        }
      } catch (err) {
        this.logger.error(`Social feed error (${feedUrl}): ${err.message}`);
      }
    }

    allItems.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));

    for (const item of allItems.slice(0, this.maxPostsPerCycle)) {
      await this._postItem(item);
      this.postedLinks.set(item.link, Date.now());
      await this._saveCache(item.link);
      postedCount++;
    }

    if (postedCount > 0) this.logger.info(`📡 Posted ${postedCount} new social items`);
    this._cleanCache();
  }

  // ---------- Post a single item ----------
  async _postItem(item) {
    const title = item.title || 'New content';
    const description = item.contentSnippet || item.content || '';
    const link = item.link || item.url || '';
    const author = item.creator || item.author || item.source?.name || 'Unknown';

    let summary = null;
    if (this.useSummary && this.deps.orchestrator) {
      const summaryAgent = this.deps.orchestrator.getAgent('SummaryAgent');
      if (summaryAgent?.summarize) {
        try {
          summary = await summaryAgent.summarize(`${title}. ${description}`, 30, 'news');
        } catch (err) {
          this.logger.debug(`Summary failed: ${err.message}`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setURL(link)
      .setDescription(summary || description || '')
      .setColor(0x00ae86)
      .setTimestamp(new Date(item.isoDate || Date.now()))
      .setFooter({ text: `📡 Source: ${author}` });

    await this._sendPost(embed);
  }
}

module.exports = SocialFeedAgent;