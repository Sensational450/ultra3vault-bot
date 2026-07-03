/**
 * 🎁 AirdropAgent v7.4 – Fixed On‑Chain Network Names
 * - Fixed ethereum, polygon, base initialization with correct Alchemy URLs
 * - Uses JsonRpcProvider with custom endpoints for all chains
 * - Added explorer URL mapping for each chain
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Parser = require('rss-parser');
const axios = require('axios');
const { ethers } = require('ethers');
const cheerio = require('cheerio');
const { sendWebhook } = require('../core/webhook');

class AirdropAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);

    // ---- Parser ----
    const userAgent = process.env.AIRDROP_USER_AGENT || 'Ultra3VaultBot/1.0';
    this.parser = new Parser({
      timeout: parseInt(process.env.AIRDROP_TIMEOUT_MS) || 15000,
      headers: { 'User-Agent': userAgent },
    });

    // ---- Core Feeds ----
    const defaultFeeds = [
      'https://airdrops.io/feed/',
      'https://cryptopotato.com/category/airdrops/feed/',
      'https://cointelegraph.com/tags/airdrop/feed',
    ];
    this.feeds = (process.env.AIRDROP_FEEDS || defaultFeeds.join(','))
      .split(',').map(u => u.trim()).filter(Boolean);

    // ---- Google Alerts RSS ----
    const googleRss = process.env.GOOGLE_ALERTS_RSS_URL;
    if (googleRss) this.feeds.push(googleRss);

    // ---- Web scraping ----
    this.enableScraping = process.env.AIRDROP_ENABLE_SCRAPING === 'true';
    this.scrapeUrls = (process.env.AIRDROP_SCRAPE_URLS || '').split(',').map(u => u.trim()).filter(Boolean);

    // ---- GitHub ----
    const githubRepos = (process.env.GITHUB_REPOS || '').split(',').map(r => r.trim()).filter(Boolean);
    for (const repo of githubRepos) {
      this.feeds.push(`https://github.com/${repo}/releases.atom`);
    }
    this.githubRepos = githubRepos;
    this.githubToken = process.env.GITHUB_API_TOKEN;
    this.lastGithubCheck = 0;
    this.githubCheckInterval = 5 * 60 * 1000;

    // ---- Twitter ----
    this.twitterBearer = process.env.TWITTER_BEARER_TOKEN;
    this.twitterKeywords = (process.env.TWITTER_KEYWORDS || '#airdrop,#retrodrop,claim $')
      .split(',').map(k => k.trim()).filter(Boolean);
    this.twitterAccounts = (process.env.TWITTER_ACCOUNTS || '')
      .split(',').map(a => a.trim()).filter(Boolean);
    this.lastTwitterCheck = 0;
    this.twitterCheckInterval = 10 * 60 * 1000;

    // ---- On‑chain ----
    this.alchemyKey = process.env.ALCHEMY_API_KEY;
    this.onchainChains = (process.env.ONCHAIN_CHAINS || 'ethereum').split(',').map(c => c.trim()).filter(Boolean);
    this.providers = {};
    this.contractListeners = [];
    this.onchainLastBlock = {};

    // ---- Chain endpoint mapping ----
    this.chainEndpoints = {
      ethereum: `https://eth-mainnet.g.alchemy.com/v2/${this.alchemyKey}`,
      polygon: `https://polygon-mainnet.g.alchemy.com/v2/${this.alchemyKey}`,
      arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${this.alchemyKey}`,
      optimism: `https://opt-mainnet.g.alchemy.com/v2/${this.alchemyKey}`,
      base: `https://base-mainnet.g.alchemy.com/v2/${this.alchemyKey}`,
    };

    // ---- Explorer URL mapping ----
    this.explorerUrls = {
      ethereum: 'https://etherscan.io/address/',
      polygon: 'https://polygonscan.com/address/',
      arbitrum: 'https://arbiscan.io/address/',
      optimism: 'https://optimistic.etherscan.io/address/',
      base: 'https://basescan.org/address/',
    };

    // ---- Discord monitoring ----
    this.discordKeywords = (process.env.AIRDROP_DISCORD_KEYWORDS || 'airdrop,claim,testnet,whitelist')
      .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    this.discordWatchChannels = (process.env.AIRDROP_DISCORD_CHANNELS || '')
      .split(',').map(id => id.trim()).filter(Boolean);

    // ---- External Discord ----
    this.extDiscordServers = (process.env.AIRDROP_EXT_DISCORD_SERVERS || '')
      .split(',').map(id => id.trim()).filter(Boolean);
    this.extDiscordChannels = (process.env.AIRDROP_EXT_DISCORD_CHANNELS || '')
      .split(',').map(id => id.trim()).filter(Boolean);

    // ---- Global keyword filters ----
    this.includeKeywords = (process.env.AIRDROP_INCLUDE_KEYWORDS || 'airdrop,claim,free,tokens,giveaway')
      .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    this.skipKeywords = (process.env.AIRDROP_SKIP_KEYWORDS || 'sponsor,partner,advertisement,gold,bitcoin,eth,trade,invest')
      .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    // ---- Scoring ----
    this.minScore = parseInt(process.env.AIRDROP_MIN_SCORE) || 50;
    this.showScore = process.env.AIRDROP_SHOW_SCORE !== 'false';
    this.preferredEcosystems = (process.env.AIRDROP_ECOSYSTEMS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    // ---- Embed config ----
    this.embedColor = parseInt(process.env.AIRDROP_EMBED_COLOR) || 0xffaa00;
    this.footerText = process.env.AIRDROP_FOOTER_TEXT || '💎 VIP/Premium Exclusive – Limited availability!';
    this.fallbackDescription = process.env.AIRDROP_FALLBACK_DESCRIPTION || 'Click the button to learn more.';
    this.maxPostsPerCycle = parseInt(process.env.MAX_AIRDROPS_PER_CYCLE) || 5;

    // ---- Webhook ----
    this.webhookUsername = 'Oracle';
    this.webhookAvatarURL = process.env.PREMIUM_AIRDROP_WEBHOOK_AVATAR || null;

    // ---- Caches ----
    this.lastPostCache = new Map();
    this.globalPosted = new Set();
    this.feedHealth = new Map();
    this.lastRun = null;

    // ---- Retry ----
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // ---- Pending items ----
    this.pendingItems = [];
  }

  async init() {
    await super.init();
    await this._ensureTables();
    await this._loadCaches();

    if (this.alchemyKey) {
      await this._initOnChainWatchers();
    }

    this.subscribe('job.airdropCheck', async () => {
      await this._checkAirdrops();
      await this._checkTwitter();
      await this._checkGithub();
      await this._scrapeWebsites();
      await this._updateStatuses();
      await this._processPendingDiscordItems();
    });

    this._expiryTimer = setInterval(() => this._updateStatuses(), 60 * 60 * 1000);

    const hasWebhook = !!process.env.PREMIUM_AIRDROP_WEBHOOK_URL;
    this.logger.info(`🎁 AirdropAgent v7.4 ready (feeds: ${this.feeds.length}, twitter: ${!!this.twitterBearer}, onchain: ${this.onchainChains.length > 0}, discordWatch: ${this.discordWatchChannels.length}, extDiscord: ${this.extDiscordServers.length}, github: ${this.githubRepos.length}, scraping: ${this.enableScraping})`);
  }

  // ---------- Load caches ----------
  async _loadCaches() {
    try {
      const posted = await this.db.all(`SELECT link FROM airdrop_posted_links`);
      for (const row of posted) {
        this.globalPosted.add(row.link);
      }
      const rows = await this.db.all(`SELECT feedUrl, lastItemLink FROM news_cache WHERE feedUrl LIKE 'airdrop:%'`);
      for (const row of rows) {
        this.lastPostCache.set(row.feedUrl, row.lastItemLink);
      }
      this.logger.debug(`Loaded ${this.globalPosted.size} posted links and ${this.lastPostCache.size} feed caches`);
    } catch (err) {
      this.logger.error(`Failed to load caches: ${err.message}`);
    }
  }

  // ---------- Discord message scanning ----------
  async onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const isExt = this.extDiscordServers.includes(message.guild.id);
    const watchChannels = isExt ? this.extDiscordChannels : this.discordWatchChannels;
    if (watchChannels.length && !watchChannels.includes(message.channel.id)) return;

    const lower = message.content.toLowerCase();
    const hasKeyword = this.discordKeywords.some(kw => lower.includes(kw));
    if (!hasKeyword) return;

    const linkMatch = message.content.match(/(https?:\/\/[^\s]+)/);
    const link = linkMatch ? linkMatch[0] : null;
    if (!link) return;

    const item = {
      title: message.content.substring(0, 80) + (message.content.length > 80 ? '...' : ''),
      link: link,
      description: message.content,
      source: `Discord${isExt ? ' (external)' : ''} (${message.author.tag})`,
      isoDate: new Date().toISOString(),
      contentSnippet: message.content,
      _pending: true,
    };
    this.pendingItems.push(item);
    this.logger.debug(`📩 Pending airdrop from Discord${isExt ? ' (ext)' : ''}: ${item.title}`);
  }

  async _processPendingDiscordItems() {
    if (!this.pendingItems.length) return;
    const items = this.pendingItems.splice(0);
    for (const item of items) {
      if (this.globalPosted.has(item.link)) continue;
      const score = this._calculateScore(item);
      if (score < this.minScore) {
        this.logger.debug(`Skipped pending (score ${score} < ${this.minScore})`);
        continue;
      }
      const { embed, components } = await this._buildAirdropEmbed(item, score);
      await this._sendAirdropMessage(embed, components, item.link);
      await this._savePostedLink(item.link, score);
      this.logger.info(`🎁 Posted pending Discord airdrop: ${item.title}`);
    }
  }

  // ---------- Twitter ----------
  async _checkTwitter() {
    if (!this.twitterBearer) return;
    if (Date.now() - this.lastTwitterCheck < this.twitterCheckInterval) return;
    this.lastTwitterCheck = Date.now();

    try {
      let query = this.twitterKeywords.join(' OR ');
      if (this.twitterAccounts.length) {
        const fromQuery = this.twitterAccounts.map(a => `from:${a}`).join(' OR ');
        query = `(${query}) OR (${fromQuery})`;
      }
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&tweet.fields=created_at,author_id&max_results=10`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.twitterBearer}` },
      });
      const tweets = response.data.data || [];
      for (const tweet of tweets) {
        const link = `https://twitter.com/i/web/status/${tweet.id}`;
        if (this.globalPosted.has(link)) continue;
        const item = {
          title: tweet.text.substring(0, 80),
          link: link,
          description: tweet.text,
          source: 'Twitter/X',
          isoDate: tweet.created_at,
          contentSnippet: tweet.text,
        };
        const score = this._calculateScore(item);
        if (score < this.minScore) continue;
        const { embed, components } = await this._buildAirdropEmbed(item, score);
        await this._sendAirdropMessage(embed, components, link);
        await this._savePostedLink(link, score);
        this.logger.info(`🐦 Posted Twitter airdrop: ${item.title}`);
      }
    } catch (err) {
      this.logger.error(`Twitter hunting failed: ${err.message}`);
    }
  }

  // ---------- GitHub ----------
  async _checkGithub() {
    if (!this.githubRepos.length) return;
    if (Date.now() - this.lastGithubCheck < this.githubCheckInterval) return;
    this.lastGithubCheck = Date.now();

    for (const repo of this.githubRepos) {
      try {
        const url = `https://api.github.com/repos/${repo}/commits?per_page=5`;
        const headers = this.githubToken ? { Authorization: `token ${this.githubToken}` } : {};
        const response = await axios.get(url, { headers });
        const commits = response.data || [];
        for (const commit of commits) {
          const message = commit.commit.message;
          const link = commit.html_url;
          if (this.globalPosted.has(link)) continue;
          const lowerMsg = message.toLowerCase();
          const hasKeyword = ['testnet', 'airdrop', 'whitelist', 'claim', 'retro'].some(kw => lowerMsg.includes(kw));
          if (!hasKeyword) continue;
          const item = {
            title: `GitHub commit: ${message.split('\n')[0]}`,
            link: link,
            description: message,
            source: `GitHub (${repo})`,
            isoDate: commit.commit.author.date,
            contentSnippet: message,
          };
          const score = this._calculateScore(item);
          if (score < this.minScore) continue;
          const { embed, components } = await this._buildAirdropEmbed(item, score);
          await this._sendAirdropMessage(embed, components, link);
          await this._savePostedLink(link, score);
          this.logger.info(`📦 Posted GitHub commit: ${item.title}`);
        }
      } catch (err) {
        this.logger.error(`GitHub check failed for ${repo}: ${err.message}`);
      }
    }
  }

  // ---------- Web scraping ----------
  async _scrapeWebsites() {
    if (!this.enableScraping || !this.scrapeUrls.length) return;
    for (const url of this.scrapeUrls) {
      try {
        const response = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(response.data);
        const text = $('body').text().toLowerCase();
        if (text.includes('airdrop') || text.includes('claim') || text.includes('whitelist')) {
          const link = $('a').first().attr('href') || url;
          if (this.globalPosted.has(link)) continue;
          const title = $('title').text() || 'Scraped page';
          const item = {
            title: title,
            link: link,
            description: text.substring(0, 200),
            source: `Scraped (${url})`,
            isoDate: new Date().toISOString(),
            contentSnippet: text.substring(0, 200),
          };
          const score = this._calculateScore(item);
          if (score < this.minScore) continue;
          const { embed, components } = await this._buildAirdropEmbed(item, score);
          await this._sendAirdropMessage(embed, components, link);
          await this._savePostedLink(link, score);
          this.logger.info(`📄 Posted scraped airdrop: ${item.title}`);
        }
      } catch (err) {
        this.logger.error(`Scraping failed for ${url}: ${err.message}`);
      }
    }
  }

  // ---------- On‑chain (fixed) ----------
  async _initOnChainWatchers() {
    if (!this.alchemyKey) return;

    for (const chain of this.onchainChains) {
      const endpoint = this.chainEndpoints[chain];
      if (!endpoint) {
        this.logger.warn(`Unknown chain: ${chain} – skipping`);
        continue;
      }

      try {
        const provider = new ethers.providers.JsonRpcProvider(endpoint);
        this.providers[chain] = provider;
        setInterval(async () => {
          await this._checkOnChain(chain);
        }, 60000);
        this.logger.info(`🔗 On‑chain watching enabled for ${chain}`);
      } catch (err) {
        this.logger.error(`Failed to init on‑chain for ${chain}: ${err.message}`);
      }
    }
  }

  async _checkOnChain(chain) {
    const provider = this.providers[chain];
    if (!provider) return;

    try {
      const fromBlock = this.onchainLastBlock[chain] || (await provider.getBlockNumber()) - 10;
      const toBlock = await provider.getBlockNumber();
      if (toBlock <= fromBlock) return;
      this.onchainLastBlock[chain] = toBlock;

      const endpoint = this.chainEndpoints[chain];
      const payload = {
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          category: ['external', 'erc20', 'erc721', 'erc1155'],
          withMetadata: true,
          excludeZeroValue: true,
        }],
        id: 1,
      };
      const response = await axios.post(endpoint, payload);
      const transfers = response.data.result?.transfers || [];
      for (const tx of transfers) {
        const hash = tx.hash;
        if (this.globalPosted.has(hash)) continue;
        const receipt = await provider.getTransactionReceipt(hash);
        if (!receipt) continue;
        if (receipt.contractAddress) {
          const contractAddress = receipt.contractAddress;
          const code = await provider.getCode(contractAddress);
          if (code === '0x') continue;
          const explorerUrl = this.explorerUrls[chain] || 'https://etherscan.io/address/';
          const item = {
            title: `New contract deployed: ${contractAddress}`,
            link: `${explorerUrl}${contractAddress}`,
            description: `New smart contract detected on ${chain}. Potential airdrop!`,
            source: `On-chain (${chain})`,
            isoDate: new Date().toISOString(),
            contentSnippet: `New contract on ${chain}`,
          };
          const score = this._calculateScore(item);
          if (score < this.minScore) continue;
          const { embed, components } = await this._buildAirdropEmbed(item, score);
          await this._sendAirdropMessage(embed, components, hash);
          await this._savePostedLink(hash, score);
          this.logger.info(`⛓️ Posted new contract: ${contractAddress}`);
        }
      }
    } catch (err) {
      this.logger.error(`On‑chain check failed for ${chain}: ${err.message}`);
    }
  }

  // ---------- Database ----------
  async _ensureTables() {
    const db = this.deps.db;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS airdrop_posted_links (
        link TEXT PRIMARY KEY,
        postedAt INTEGER,
        score INTEGER,
        status TEXT DEFAULT 'active'
      );
      CREATE TABLE IF NOT EXISTS airdrop_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link TEXT,
        userId TEXT,
        guildId TEXT,
        claimedAt INTEGER,
        skipped INTEGER DEFAULT 0,
        UNIQUE(link, userId)
      );
      CREATE TABLE IF NOT EXISTS airdrop_user_prefs (
        userId TEXT,
        guildId TEXT,
        minScore INTEGER,
        ecosystems TEXT,
        PRIMARY KEY (userId, guildId)
      );
      CREATE TABLE IF NOT EXISTS airdrop_github_tracking (
        hash TEXT PRIMARY KEY,
        repo TEXT,
        checkedAt INTEGER
      );
    `);
  }

  // ---------- Scoring ----------
  _calculateScore(item) {
    let score = 50;
    const title = (item.title || '').toLowerCase();
    const desc = (item.contentSnippet || item.content || '').toLowerCase();
    const source = item.source || '';

    const positiveWords = ['airdrop', 'claim', 'free', 'giveaway', 'eligible', 'testnet', 'whitelist', 'retro'];
    let posCount = 0;
    for (const w of positiveWords) {
      if (title.includes(w) || desc.includes(w)) posCount++;
    }
    score += Math.min(posCount * 5, 20);

    const negativeWords = ['scam', 'fraud', 'expired', 'closed', 'ended'];
    let negCount = 0;
    for (const w of negativeWords) {
      if (title.includes(w) || desc.includes(w)) negCount++;
    }
    score -= negCount * 10;

    if (source.includes('airdrops.io')) score += 15;
    else if (source.includes('cryptopotato')) score += 5;
    else if (source.includes('cointelegraph')) score += 5;
    else if (source.includes('Twitter')) score += 5;
    else if (source.includes('Discord')) score += 3;
    else if (source.includes('GitHub')) score += 8;
    else if (source.includes('On-chain')) score += 10;
    else if (source.includes('Scraped')) score += 2;

    const pubDate = new Date(item.isoDate || Date.now());
    const ageHours = (Date.now() - pubDate.getTime()) / (60 * 60 * 1000);
    if (ageHours < 24) score += 10;
    else if (ageHours < 72) score += 5;
    else score -= 5;

    return Math.min(Math.max(score, 0), 100);
  }

  // ---------- Feed fetching ----------
  async _fetchFeedWithRetry(feedUrl, attempt = 1) {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      this.feedHealth.set(feedUrl, { lastSuccess: Date.now(), failures: 0, lastError: null });
      return feed;
    } catch (err) {
      const health = this.feedHealth.get(feedUrl) || { failures: 0 };
      health.failures++;
      health.lastError = err.message;
      this.feedHealth.set(feedUrl, health);
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchFeedWithRetry(feedUrl, attempt + 1);
      }
      throw err;
    }
  }

  // ---------- Main feed check ----------
  async _checkAirdrops() {
    const channelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!channelId && !process.env.PREMIUM_AIRDROP_WEBHOOK_URL) {
      this.logger.debug('No channel or webhook configured – skipping airdrop check');
      return;
    }

    this.lastRun = Date.now();
    const allItems = [];

    const feedPromises = this.feeds.map(url => this._fetchFeedWithRetry(url));
    const results = await Promise.allSettled(feedPromises);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const feedUrl = this.feeds[i];
      if (result.status === 'rejected') {
        this.logger.error(`Feed ${feedUrl} failed: ${result.reason}`);
        continue;
      }
      const feed = result.value;
      const items = feed.items || [];
      const lastPosted = this.lastPostCache.get(feedUrl);

      let newItems = items.filter(item => item.link !== lastPosted);
      if (newItems.length === 0) continue;

      newItems = newItems.filter(item => {
        if (this.globalPosted.has(item.link)) return false;
        const title = (item.title || '').toLowerCase();
        const hasInclude = this.includeKeywords.some(kw => title.includes(kw));
        if (!hasInclude) return false;
        if (this.skipKeywords.some(kw => title.includes(kw))) return false;
        return true;
      });

      for (const item of newItems) {
        const score = this._calculateScore(item);
        if (score < this.minScore) continue;
        if (this.preferredEcosystems.length > 0) {
          const itemText = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
          const match = this.preferredEcosystems.some(ec => itemText.includes(ec));
          if (!match) continue;
        }
        allItems.push({ ...item, feedUrl, score });
      }

      const latestLink = items[0]?.link;
      if (latestLink) {
        this.lastPostCache.set(feedUrl, latestLink);
        await this._saveFeedCache(feedUrl, latestLink);
      }
    }

    allItems.sort((a, b) => b.score - a.score);
    let postedCount = 0;
    for (const item of allItems.slice(0, this.maxPostsPerCycle)) {
      const { embed, components } = await this._buildAirdropEmbed(item, item.score);
      await this._sendAirdropMessage(embed, components, item.link);
      await this._savePostedLink(item.link, item.score);
      postedCount++;
    }
    if (postedCount > 0) {
      this.logger.info(`🎁 Posted ${postedCount} new airdrops from RSS/feeds`);
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

  // ---------- Save posted link ----------
  async _savePostedLink(link, score) {
    try {
      await this.db.run(
        `INSERT OR IGNORE INTO airdrop_posted_links (link, postedAt, score, status) VALUES (?, ?, ?, ?)`,
        [link, Date.now(), score, 'active']
      );
      this.globalPosted.add(link);
    } catch (err) {
      this.logger.error(`Failed to save posted link: ${err.message}`);
    }
  }

  // ---------- Status update ----------
  async _updateStatuses() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await this.db.all(`SELECT link, postedAt FROM airdrop_posted_links WHERE status = 'active'`);
    for (const row of rows) {
      if (row.postedAt < sevenDaysAgo) {
        await this.db.run(`UPDATE airdrop_posted_links SET status = 'expired' WHERE link = ?`, [row.link]);
        this.logger.debug(`⏰ Airdrop expired: ${row.link}`);
      }
    }
  }

  // ---------- Build embed ----------
  async _buildAirdropEmbed(item, score) {
    let image = null;
    if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) image = item.enclosure.url;
    else if (item.media?.content?.[0]?.url) image = item.media.content[0].url;
    else if (item['media:content']?.['$']?.url) image = item['media:content']['$'].url;
    else if (item.image?.url) image = item.image.url;
    else if (item.thumbnail) image = item.thumbnail;

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

    const sourceName = item.source || item.creator || item.author || 'Unknown';
    let fields = [{ name: '📡 Source', value: sourceName, inline: true }];
    if (this.showScore) fields.push({ name: '⭐ Score', value: `${score}/100`, inline: true });
    const detectedEcosystems = ['ethereum', 'solana', 'arbitrum', 'polygon', 'optimism', 'avalanche', 'bnb'];
    const itemText = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
    const found = detectedEcosystems.filter(ec => itemText.includes(ec));
    if (found.length) {
      fields.push({ name: '🔗 Chain(s)', value: found.map(e => e.charAt(0).toUpperCase() + e.slice(1)).join(', '), inline: true });
    }
    embed.addFields(fields);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`airdrop_claim_${item.link}`)
        .setLabel('✅ I\'m Interested')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`airdrop_skip_${item.link}`)
        .setLabel('❌ Skip')
        .setStyle(ButtonStyle.Secondary)
    );
    return { embed, components: [row] };
  }

  // ---------- Send message via webhook/channel ----------
  async _sendAirdropMessage(embed, components, link) {
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
    const channelId = process.env.PREMIUM_AIRDROP_CHANNEL_ID;
    if (!channelId) {
      this.logger.warn('No PREMIUM_AIRDROP_CHANNEL_ID set – cannot send airdrop');
      return;
    }
    const channel = this.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(`Airdrop channel ${channelId} not found`);
      return;
    }
    await channel.send({ embeds: [embed], components: components || [] });
    this.logger.debug('✅ Airdrop sent via channel.send');
  }

  // ---------- Button handlers ----------
  async onInteractionCreate(interaction) {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (customId.startsWith('airdrop_claim_')) {
      const link = customId.replace('airdrop_claim_', '');
      await this._handleClaim(interaction, link);
    } else if (customId.startsWith('airdrop_skip_')) {
      const link = customId.replace('airdrop_skip_', '');
      await this._handleSkip(interaction, link);
    }
  }

  async _handleClaim(interaction, link) {
    const db = this.deps.db;
    try {
      await db.run(
        `INSERT OR IGNORE INTO airdrop_claims (link, userId, guildId, claimedAt, skipped) VALUES (?, ?, ?, ?, 0)`,
        [link, interaction.user.id, interaction.guild.id, Date.now()]
      );
      await interaction.reply({ content: '✅ You claimed this airdrop! Good luck!', flags: MessageFlags.Ephemeral });
      this.logger.info(`Airdrop claimed: ${interaction.user.tag} for ${link}`);
    } catch (err) {
      this.logger.error(`Claim failed: ${err.message}`);
      await interaction.reply({ content: '❌ Failed to record claim.', flags: MessageFlags.Ephemeral });
    }
  }

  async _handleSkip(interaction, link) {
    const db = this.deps.db;
    try {
      await db.run(
        `INSERT OR IGNORE INTO airdrop_claims (link, userId, guildId, claimedAt, skipped) VALUES (?, ?, ?, ?, 1)`,
        [link, interaction.user.id, interaction.guild.id, Date.now()]
      );
      await interaction.reply({ content: '❌ Skipped. We\'ll show you different ones later.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      this.logger.error(`Skip failed: ${err.message}`);
      await interaction.reply({ content: '❌ Failed to record skip.', flags: MessageFlags.Ephemeral });
    }
  }

  // ---------- Slash commands ----------
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;
    if (commandName === 'airdrop') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'status') await this.cmdStatus(interaction);
      else if (sub === 'setscore') await this.cmdSetScore(interaction);
      else if (sub === 'leaderboard') await this.cmdLeaderboard(interaction);
      else if (sub === 'setecosystem') await this.cmdSetEcosystem(interaction);
    }
  }

  async cmdStatus(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📊 Airdrop Agent Status')
      .setColor(0x3498db)
      .addFields(
        { name: 'Feeds', value: `${this.feeds.length} configured`, inline: true },
        { name: 'Last Run', value: this.lastRun ? `<t:${Math.floor(this.lastRun/1000)}:R>` : 'Never', inline: true },
        { name: 'Min Score', value: `${this.minScore}`, inline: true },
        { name: 'Posted Links', value: `${this.globalPosted.size}`, inline: true },
        { name: 'Ecosystems', value: this.preferredEcosystems.length ? this.preferredEcosystems.join(', ') : 'All', inline: true },
        { name: 'Twitter', value: this.twitterBearer ? '✅' : '❌', inline: true },
        { name: 'On‑chain', value: this.onchainChains.length ? `✅ (${this.onchainChains.join(',')})` : '❌', inline: true },
        { name: 'Discord Watch', value: this.discordWatchChannels.length ? `${this.discordWatchChannels.length} channels` : '❌', inline: true },
        { name: 'Ext Discord', value: this.extDiscordServers.length ? `${this.extDiscordServers.length} servers` : '❌', inline: true },
        { name: 'GitHub', value: this.githubRepos.length ? `✅ (${this.githubRepos.length} repos)` : '❌', inline: true },
        { name: 'Scraping', value: this.enableScraping ? '✅' : '❌', inline: true }
      )
      .setTimestamp();
    let feedStatus = '';
    for (const [url, health] of this.feedHealth) {
      const status = health.lastError ? '❌' : '✅';
      feedStatus += `${status} ${url.slice(0, 40)}... (failures: ${health.failures || 0})\n`;
    }
    if (feedStatus) embed.addFields({ name: 'Feed Health', value: feedStatus, inline: false });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  async cmdSetScore(interaction) {
    const score = interaction.options.getInteger('score');
    if (score < 0 || score > 100) {
      return interaction.reply({ content: 'Score must be between 0 and 100.', flags: MessageFlags.Ephemeral });
    }
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO airdrop_user_prefs (userId, guildId, minScore) VALUES (?, ?, ?)`,
      [interaction.user.id, interaction.guild.id, score]
    );
    await interaction.reply({ content: `✅ Your minimum airdrop score is now ${score}.`, flags: MessageFlags.Ephemeral });
  }

  async cmdSetEcosystem(interaction) {
    const ecosystems = interaction.options.getString('ecosystems');
    const db = this.deps.db;
    await db.run(
      `INSERT OR REPLACE INTO airdrop_user_prefs (userId, guildId, ecosystems) VALUES (?, ?, ?)`,
      [interaction.user.id, interaction.guild.id, ecosystems]
    );
    await interaction.reply({ content: `✅ Your preferred ecosystems: ${ecosystems || 'All'}`, flags: MessageFlags.Ephemeral });
  }

  async cmdLeaderboard(interaction) {
    const db = this.deps.db;
    const rows = await db.all(
      `SELECT userId, COUNT(*) as count FROM airdrop_claims WHERE guildId = ? AND skipped = 0 GROUP BY userId ORDER BY count DESC LIMIT 10`,
      [interaction.guild.id]
    );
    if (!rows.length) {
      return interaction.reply({ content: 'No claims yet.', flags: MessageFlags.Ephemeral });
    }
    let desc = '';
    for (let i = 0; i < rows.length; i++) {
      const user = await this.client.users.fetch(rows[i].userId).catch(() => null);
      const name = user ? user.username : rows[i].userId;
      desc += `${i+1}. **${name}** – ${rows[i].count} claims\n`;
    }
    const embed = new EmbedBuilder().setTitle('🏆 Top Airdrop Claimers').setDescription(desc).setColor(0xffd700);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------- Cleanup ----------
  async destroy() {
    if (this._expiryTimer) clearInterval(this._expiryTimer);
    for (const provider of Object.values(this.providers)) {
      if (provider.removeAllListeners) provider.removeAllListeners();
    }
    await super.destroy();
  }
}

module.exports = AirdropAgent;