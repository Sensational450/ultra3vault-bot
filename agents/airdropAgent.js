/**
 * 🎁 AirdropAgent v6.4 – Centralized Webhooks
 * - Uses global database table for deduplication across feeds and restarts
 * - Configurable keyword filter to skip non‑airdrop content
 * - Feeds, filters, colors, texts fully configurable via env
 * - Sends airdrops via "Oracle" webhook (key: 'premiumAirdrops') with fallback to channel.send
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Parser = require('rss-parser');
const { sendWebhook } = require('../index'); // ✅ centralized helper

class AirdropAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Parser ----
    const userAgent = process.env.AIRDROP_USER_AGENT || 'Ultra3VaultBot/1.0';
    this.parser = new Parser({
      timeout: parseInt(process.env.AIRDROP_TIMEOUT_MS) || 10000,
      headers: { 'User-Agent': userAgent },
    });

    // ---- Feeds ----
    const defaultFeeds = [
      'https://airdrops.io/feed/',
      'https://cryptopotato.com/category/airdrops/feed/',
      'https://cointelegraph.com/tags/airdrop/feed',
    ];
    this.feeds = (process.env.AIRDROP_FEEDS || defaultFeeds.join(','))
      .split(',').map(u => u.trim()).filter(Boolean);

    // ---- Filter keywords (title must NOT contain these) ----
    const defaultSkip = ['sponsor', 'partner', 'advertisement', 'gold', 'bitcoin', 'btc', 'eth', 'trade', 'invest'];
    this.skipKeywords = (process.env.AIRDROP_SKIP_KEYWORDS || defaultSkip.join(','))
      .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    // ---- Embed customization ----
    this.embedColor = parseInt(process.env.AIRDROP_EMBED_COLOR) || 0xffaa00;
    this.footerText = process.env.AIRDROP_FOOTER_TEXT || '💎 VIP/Premium Exclusive – Limited availability!';
    this.buttonLabel = process.env.AIRDROP_BUTTON_LABEL || '🚀 Claim Airdrop';
    this.fallbackDescription = process.env.AIRDROP_FALLBACK_DESCRIPTION || 'Click the button to learn more.';

    // ---- Limits ----
    this.maxPostsPerCycle = parseInt(process.env.MAX_AIRDROPS_PER_CYCLE) || 3;

    // ---- Webhook display settings (used by centralized helper) ----
    this.webhookUsername = 'Oracle';
    this.webhookAvatarURL = process.env.PREMIUM_AIRDROP_WEBHOOK_AVATAR || null;

    // ---- In‑memory caches ----
    this.lastPostCache = new Map();       // feedUrl → last link (per‑feed, to avoid re‑fetch)
    this.globalPosted = new Set();        // all posted links (loaded from DB at start)
  }

  async init() {
    await super.init();
    await this._loadCaches();
    this.subscribe('job.airdropCheck', async () => {
      this.logger.debug('🎁 Checking for new airdrops...');
      await this._checkAirdrops();
    });
    const hasWebhook = !!process.env.PREMIUM_AIRDROP_WEBHOOK_URL;
    this.logger.info(`🎁 AirdropAgent v6.4 ready (feeds: ${this.feeds.length}, webhook: ${hasWebhook ? '✅' : '❌'})`);
  }

  // ---------- Load caches from DB ----------
  async _loadCaches() {
    try {
      // 1. Load per‑feed last link
      const rows = await this.db.all(
        `SELECT feedUrl, lastItemLink FROM news_cache WHERE feedUrl LIKE 'airdrop:%'`
      );
      for (const row of rows) {
        this.lastPostCache.set(row.feedUrl, row.lastItemLink);
      }

      // 2. Load global posted links
      const posted = await this.db.all(`SELECT link FROM airdrop_posted_links`);
      for (const row of posted) {
        this.globalPosted.add(row.link);
      }
      this.logger.debug(`Loaded ${this.lastPostCache.size} feed caches, ${this.globalPosted.size} global posted links`);
    } catch (err) {
      // Table might not exist – create it
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS airdrop_posted_links (
          link TEXT PRIMARY KEY,
          postedAt INTEGER
        )
      `);
    }
  }

  // ---------- Helper: Send via Webhook (centralized) or Channel ----------
  async _sendAirdropMessage(embed, components) {
    // 1. Try webhook if configured
    if (process.env.PREMIUM_AIRDROP_WEBHOOK_URL) {
      try {
        await sendWebhook('premiumAirdrops', { embeds: [embed], components: components || [] }, {
          username: this.webhookUsername,
          avatarURL: this.webhookAvatarURL || undefined,
        });
        this.logger.debug('✅ Airdrop sent via Oracle webhook');
        return;
      } catch (err) {
        this.logger.warn(`Webhook failed: ${err.message} – falling back to channel.send`);
      }
    }

    // 2. Fallback: use the channel directly
    const channelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!channelId) {
      this.logger.warn('No PREMIUM_AIRDROP_CHANNEL_ID set – cannot send airdrop');
      return;
    }
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Airdrop channel ${channelId} not found or not text-based`);
      return;
    }
    await channel.send({ embeds: [embed], components: components || [] });
    this.logger.debug('✅ Airdrop sent via channel.send');
  }

  // ---------- Save global posted link ----------
  async _saveGlobalLink(link) {
    try {
      await this.db.run(
        `INSERT OR IGNORE INTO airdrop_posted_links (link, postedAt) VALUES (?, ?)`,
        [link, Date.now()]
      );
      this.globalPosted.add(link);
    } catch (err) {
      this.logger.error(`Failed to save global link: ${err.message}`);
    }
  }

  // ---------- Save per‑feed cache ----------
  async _saveFeedCache(feedUrl, lastLink) {
    const key = `airdrop:${feedUrl}`;
    await this.db.run(
      `INSERT OR REPLACE INTO news_cache (feedUrl, lastItemLink, lastPostAt) VALUES (?, ?, ?)`,
      [key, lastLink, Date.now()]
    ).catch(err => this.logger.error(`Failed to save feed cache: ${err.message}`));
  }

  // ---------- Main Job ----------
  async _checkAirdrops() {
    const channelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!channelId && !process.env.PREMIUM_AIRDROP_WEBHOOK_URL) {
      this.logger.debug('No channel or webhook configured – skipping airdrop check');
      return;
    }

    let postedCount = 0;
    const allNewItems = [];

    for (const feedUrl of this.feeds) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const items = feed.items || [];
        const lastPosted = this.lastPostCache.get(feedUrl);

        // Filter new items (based on per‑feed cache)
        let newItems = items.filter(item => item.link !== lastPosted);
        if (newItems.length === 0) continue;

        // Further filter: skip if already posted globally or contains skip keywords
        newItems = newItems.filter(item => {
          if (this.globalPosted.has(item.link)) return false;
          const title = (item.title || '').toLowerCase();
          if (this.skipKeywords.some(kw => title.includes(kw))) return false;
          return true;
        });

        if (newItems.length === 0) continue;

        // Take the newest 5 per feed
        for (const item of newItems.slice(0, 5)) {
          allNewItems.push({ ...item, feedUrl });
        }

        // Update per‑feed cache with the latest link (the newest item)
        const latestLink = items[0]?.link;
        if (latestLink) {
          this.lastPostCache.set(feedUrl, latestLink);
          await this._saveFeedCache(feedUrl, latestLink);
        }
      } catch (err) {
        this.logger.error(`Airdrop feed error (${feedUrl}): ${err.message}`);
      }
    }

    // Sort all new items by published date (newest first)
    allNewItems.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));

    // Post up to maxPostsPerCycle
    for (const item of allNewItems.slice(0, this.maxPostsPerCycle)) {
      const { embed, components } = await this._buildAirdropEmbed(item);
      await this._sendAirdropMessage(embed, components);
      await this._saveGlobalLink(item.link);
      postedCount++;
    }

    if (postedCount > 0) {
      this.logger.info(`🎁 Posted ${postedCount} new airdrop${postedCount > 1 ? 's' : ''}`);
    }
  }

  // ---------- Build Airdrop Embed ----------
  async _buildAirdropEmbed(item) {
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

    // AI summary (if available)
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

    return { embed, components: [row] };
  }
}

module.exports = AirdropAgent;