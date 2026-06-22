/**
 * 🎨 EmbedBuilder v10.0
 * - Reusable embed templates (success, error, warning, info, custom)
 * - 🆕 Signal, Whale, Recommendation, Growth, AMA, Report embed types
 * - 🆕 Pagination support with built-in buttons
 * - 🆕 Data formatting helpers (truncate, array to fields, price formatting)
 * - 🆕 Mobile-friendly field splitting
 * - 🆕 Button row builder with link, action, and select menu support
 * - Standard colors and emojis
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

class EmbedBuilderUtils {
  constructor() {
    // 🎨 Standard color palette
    this.colors = {
      success: 0x2ecc71,    // green
      error: 0xe74c3c,      // red
      warning: 0xf39c12,    // orange
      info: 0x3498db,       // blue
      vip: 0x9b59b6,        // purple
      economy: 0xf1c40f,    // gold
      moderation: 0xe67e22, // dark orange
      signal: 0x00ff88,     // bright green (BUY)
      signalSell: 0xff4444, // bright red (SELL)
      signalHold: 0xffaa00, // yellow (HOLD)
      whale: 0xff7700,      // orange
      growth: 0x00aaff,     // light blue
      ama: 0x9b59b6,        // purple
      report: 0x2c3e50,     // dark navy
    };

    // 🆕 Emoji mapping for embed types
    this.emojiMap = {
      buy: '🟢',
      sell: '🔴',
      hold: '🟡',
      vip: '💎',
      premium: '💎💎',
      whale: '🐋',
      signal: '📈',
      news: '📰',
      warning: '⚠️',
      error: '❌',
      success: '✅',
      info: 'ℹ️',
      growth: '📈',
      ama: '🎙️',
      report: '📊',
    };
  }

  // ===================== BASE METHOD =====================
  base(options = {}) {
    const embed = new EmbedBuilder();
    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.color) embed.setColor(options.color);
    if (options.fields) embed.addFields(options.fields);
    if (options.footer) embed.setFooter(options.footer);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.author) embed.setAuthor(options.author);
    if (options.timestamp !== false) embed.setTimestamp();
    if (options.url) embed.setURL(options.url);
    return embed;
  }

  // ===================== TEMPLATED EMBEDS =====================

  success(title, description, options = {}) {
    return this.base({
      title: `✅ ${title}`,
      description,
      color: this.colors.success,
      ...options,
    });
  }

  error(title, description, options = {}) {
    return this.base({
      title: `❌ ${title}`,
      description,
      color: this.colors.error,
      ...options,
    });
  }

  warning(title, description, options = {}) {
    return this.base({
      title: `⚠️ ${title}`,
      description,
      color: this.colors.warning,
      ...options,
    });
  }

  info(title, description, options = {}) {
    return this.base({
      title: `ℹ️ ${title}`,
      description,
      color: this.colors.info,
      ...options,
    });
  }

  vip(title, description, options = {}) {
    return this.base({
      title: `💎 ${title}`,
      description,
      color: this.colors.vip,
      ...options,
    });
  }

  economy(title, description, options = {}) {
    return this.base({
      title: `💰 ${title}`,
      description,
      color: this.colors.economy,
      ...options,
    });
  }

  moderation(title, description, options = {}) {
    return this.base({
      title: `🛡️ ${title}`,
      description,
      color: this.colors.moderation,
      ...options,
    });
  }

  // ===================== 🆕 NEW EMBED TYPES =====================

  /**
   * 📈 Trading Signal embed (BUY/SELL/HOLD)
   * @param {string} coin - Coin symbol (e.g., BTC)
   * @param {string} action - 'BUY', 'SELL', or 'HOLD'
   * @param {number} confidence - Confidence percentage (0-100)
   * @param {Object} data - Additional data (price, change24h, rsi, reasons)
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  signal(coin, action, confidence, data = {}, options = {}) {
    const emoji = action === 'BUY' ? this.emojiMap.buy : action === 'SELL' ? this.emojiMap.sell : this.emojiMap.hold;
    const color = action === 'BUY' ? this.colors.signal : action === 'SELL' ? this.colors.signalSell : this.colors.signalHold;

    const fields = [
      { name: '💰 Price', value: data.priceUsd ? `$${data.priceUsd.toFixed(2)}` : 'N/A', inline: true },
      { name: '📊 24h Change', value: data.change24h !== undefined ? `${data.change24h.toFixed(1)}%` : 'N/A', inline: true },
      { name: '📈 RSI', value: data.rsi !== null ? data.rsi.toString() : 'N/A', inline: true },
    ];

    if (data.reasons) {
      fields.push({ name: '📝 Reason', value: this._truncate(data.reasons, 100), inline: false });
    }

    return this.base({
      title: `${emoji} Signal: ${coin}`,
      description: `**${action}** with ${confidence}% confidence`,
      color,
      fields,
      ...options,
    });
  }

  /**
   * 🐋 Whale Alert embed
   * @param {Object} tx - Transaction data (amount, symbol, usdValue, blockchain, from, to, hash)
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  whale(tx, options = {}) {
    const fromLabel = tx.from?.owner !== 'Unknown' ? tx.from.owner : (tx.from?.address?.substring(0, 10) + '...' || 'Unknown');
    const toLabel = tx.to?.owner !== 'Unknown' ? tx.to.owner : (tx.to?.address?.substring(0, 10) + '...' || 'Unknown');
    const explorerUrl = tx.explorer || `https://etherscan.io/tx/${tx.hash}`;

    return this.base({
      title: `🐋 Whale Alert: ${tx.amount?.toFixed(2) || '?'} ${tx.symbol || 'Unknown'}`,
      description: `**${tx.transactionType || 'Transfer'}** on **${tx.blockchain || 'Unknown'}**`,
      color: this.colors.whale,
      fields: [
        { name: '💰 USD Value', value: `$${tx.usdValue?.toLocaleString() || 'N/A'}`, inline: true },
        { name: '🔗 Blockchain', value: tx.blockchain || 'N/A', inline: true },
        { name: '⬅️ From', value: fromLabel, inline: false },
        { name: '➡️ To', value: toLabel, inline: false },
        { name: '🔍 Transaction', value: `[View on Explorer](${explorerUrl})`, inline: false },
      ],
      footer: { text: 'Ultra3Vault • Whale Monitor' },
      timestamp: true,
      ...options,
    });
  }

  /**
   * 💎 Recommendation embed (VIP or Premium)
   * @param {Object} rec - Recommendation data (tier, asset, action, confidence, reason, price, urgency, source)
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  recommendation(rec, options = {}) {
    const isPremium = rec.tier === 'premium';
    const emoji = isPremium ? this.emojiMap.premium : this.emojiMap.vip;
    const color = isPremium ? this.colors.vip : this.colors.info;
    const tierLabel = isPremium ? 'PREMIUM' : 'VIP';

    const fields = [
      { name: '💡 Reason', value: this._truncate(rec.reason || 'Market opportunity detected', 100), inline: false },
      { name: '💵 Price', value: rec.price ? `$${rec.price.toFixed(2)}` : 'N/A', inline: true },
      { name: '🔥 Urgency', value: (rec.urgency || 'low').toUpperCase(), inline: true },
      { name: '👑 Tier', value: tierLabel, inline: true },
    ];

    return this.base({
      title: `${emoji} ${rec.action || 'Watch'} ${rec.asset || 'Unknown'}`,
      description: `**${rec.confidence || 0}% confidence** | ${rec.source || 'RecommendationAI'}`,
      color,
      fields,
      timestamp: true,
      footer: { text: 'Ultra3Vault • Recommendation AI v5.0' },
      ...options,
    });
  }

  /**
   * 📊 Weekly Growth Report embed
   * @param {Object} data - { totalMembers, newMembers, topChatters, date }
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  growthReport(data, options = {}) {
    const topList = data.topChatters?.length > 0
      ? data.topChatters.map((u, i) => `${i+1}. ${u.name || u.tag} — ${u.count || 0} messages`).join('\n')
      : 'No data yet.';

    return this.base({
      title: '📊 Weekly Growth Report',
      description: `📅 **${data.date || new Date().toLocaleDateString()}**`,
      color: this.colors.growth,
      fields: [
        { name: '👥 Total Members', value: (data.totalMembers || 0).toString(), inline: true },
        { name: '🚀 New Members (7d)', value: (data.newMembers || 0).toString(), inline: true },
        { name: '📈 Top Chatters', value: this._truncate(topList, 200), inline: false },
      ],
      timestamp: true,
      footer: { text: 'Ultra3Vault • Growth AI v5.0' },
      ...options,
    });
  }

  /**
   * 🎙️ AMA Summary embed
   * @param {Array} questions - Array of { question, answer, user }
   * @param {string} summary - AI-generated summary
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  amaSummary(questions, summary, options = {}) {
    const fields = [];
    if (summary) {
      fields.push({ name: '📝 Summary', value: this._truncate(summary, 200), inline: false });
    }
    const topQ = (questions || []).slice(0, 5);
    for (const q of topQ) {
      fields.push({
        name: `❓ ${this._truncate(q.question, 80)}`,
        value: `💬 ${this._truncate(q.answer || 'Pending answer...', 100)}`,
        inline: false,
      });
    }

    return this.base({
      title: '🎙️ AMA Session Summary',
      color: this.colors.ama,
      fields,
      timestamp: true,
      footer: { text: 'Ultra3Vault • AMA AI v5.0' },
      ...options,
    });
  }

  /**
   * 📋 Performance Report embed
   * @param {Object} data - { agentStatus, apiUsage, memory, uptime }
   * @param {Object} options - Extra embed options
   * @returns {EmbedBuilder}
   */
  performanceReport(data, options = {}) {
    const statusLines = (data.agentStatus || []).map(a =>
      `${a.status === 'healthy' ? '✅' : '⚠️'} **${a.name}** — ${a.errorCount || 0} errors`
    ).join('\n');

    return this.base({
      title: '📊 Bot Performance Report',
      description: `📅 **${data.date || new Date().toLocaleDateString()}**`,
      color: this.colors.report,
      fields: [
        { name: '🤖 Agent Status', value: this._truncate(statusLines || 'No agents', 200), inline: false },
        { name: '📡 API Usage (monthly)', value: this._truncate(data.apiSummary || 'No data', 100), inline: false },
        { name: '💾 Memory', value: data.memory || 'N/A', inline: true },
        { name: '⏱️ Uptime', value: data.uptime || 'N/A', inline: true },
      ],
      timestamp: true,
      footer: { text: 'Ultra3Vault • Optimization AI v10.0' },
      ...options,
    });
  }

  // ===================== CUSTOM EMBED =====================
  custom(options = {}) {
    return this.base(options);
  }

  // ===================== HELPER METHODS =====================

  addField(embed, name, value, inline = true) {
    embed.addFields({ name, value, inline });
    return embed;
  }

  simple(description, type = 'info') {
    const method = this[type] || this.info;
    return method(type.charAt(0).toUpperCase() + type.slice(1), description);
  }

  objectToFields(obj, order = null, inline = true) {
    const keys = order || Object.keys(obj);
    return keys.map(key => ({
      name: key,
      value: String(obj[key] ?? '—'),
      inline,
    }));
  }

  // ===================== 🆕 DATA FORMATTING HELPERS =====================

  /**
   * ✂️ Truncate text to max length with ellipsis
   * @param {string} text
   * @param {number} maxLength
   * @returns {string}
   */
  _truncate(text, maxLength = 100) {
    if (!text) return '—';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * 📋 Format array as field values (good for leaderboards, lists)
   * @param {Array} items - Array of items to format
   * @param {Function} formatter - Function(item, index) => string
   * @param {number} maxItems - Max items to show
   * @returns {string}
   */
  formatList(items, formatter, maxItems = 10) {
    const list = items.slice(0, maxItems);
    return list.map((item, i) => formatter(item, i + 1)).join('\n') || 'No items to display.';
  }

  /**
   * 💰 Format USD price with commas
   * @param {number} price
   * @param {number} decimals
   * @returns {string}
   */
  formatPrice(price, decimals = 2) {
    if (price === undefined || price === null) return 'N/A';
    return `$${price.toFixed(decimals).toLocaleString()}`;
  }

  /**
   * 📊 Format percentage change with sign
   * @param {number} change
   * @param {number} decimals
   * @returns {string}
   */
  formatChange(change, decimals = 1) {
    if (change === undefined || change === null) return 'N/A';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(decimals)}%`;
  }

  /**
   * 📋 Split fields into groups of up to 10 fields per embed
   * Useful for large data sets (leaderboards, inventory, etc.)
   * @param {Array<Object>} fields - Array of { name, value, inline }
   * @param {number} maxPerEmbed - Max fields per embed (default 10)
   * @returns {Array<Array<Object>>} - Array of field groups
   */
  splitFields(fields, maxPerEmbed = 10) {
    const groups = [];
    for (let i = 0; i < fields.length; i += maxPerEmbed) {
      groups.push(fields.slice(i, i + maxPerEmbed));
    }
    return groups;
  }

  /**
   * 📄 Creates a paginated embed response
   * @param {Object} options - { embed, totalPages, currentPage, pageData, buildPage }
   * @returns {Object} - { embed, buttons }
   */
  createPaginatedEmbed(options) {
    const { currentPage = 1, totalPages = 1, embed } = options;
    const buttons = this.createButtonRow([
      { label: '◀ Previous', style: 'secondary', customId: 'page_prev', disabled: currentPage === 1 },
      { label: `${currentPage}/${totalPages}`, style: 'secondary', customId: 'page_info', disabled: true },
      { label: 'Next ▶', style: 'secondary', customId: 'page_next', disabled: currentPage === totalPages },
      { label: '⏹ Stop', style: 'danger', customId: 'page_stop' },
    ]);

    return { embed, buttons };
  }

  // ===================== BUTTON ROW BUILDER =====================

  createButtonRow(buttons) {
    const row = new ActionRowBuilder();
    for (const btn of buttons) {
      let style;
      switch (btn.style) {
        case 'primary': style = ButtonStyle.Primary; break;
        case 'secondary': style = ButtonStyle.Secondary; break;
        case 'success': style = ButtonStyle.Success; break;
        case 'danger': style = ButtonStyle.Danger; break;
        case 'link': style = ButtonStyle.Link; break;
        default: style = ButtonStyle.Primary;
      }
      const button = new ButtonBuilder()
        .setLabel(btn.label)
        .setStyle(style);
      if (btn.customId) button.setCustomId(btn.customId);
      if (btn.url) button.setURL(btn.url);
      if (btn.emoji) button.setEmoji(btn.emoji);
      if (btn.disabled) button.setDisabled(true);
      row.addComponents(button);
    }
    return row;
  }

  /**
   * 🆕 Create multiple button rows (up to 5 rows of 5 buttons)
   * @param {Array<Array<Object>>} rows - Array of button arrays
   * @returns {Array<ActionRowBuilder>}
   */
  createMultipleButtonRows(rows) {
    return rows.map(buttons => this.createButtonRow(buttons));
  }

  /**
   * 🆕 Create a select menu row
   * @param {Object} options - { customId, placeholder, options: [{ label, value, description, default }], maxValues, minValues }
   * @returns {ActionRowBuilder}
   */
  createSelectMenu(options) {
    const row = new ActionRowBuilder();
    const menu = new StringSelectMenuBuilder()
      .setCustomId(options.customId)
      .setPlaceholder(options.placeholder || 'Select an option...');
    if (options.maxValues) menu.setMaxValues(options.maxValues);
    if (options.minValues) menu.setMinValues(options.minValues);
    for (const opt of options.options) {
      const option = { label: opt.label, value: opt.value };
      if (opt.description) option.description = opt.description;
      if (opt.default) option.default = true;
      if (opt.emoji) option.emoji = opt.emoji;
      menu.addOptions(option);
    }
    row.addComponents(menu);
    return row;
  }

  // ===================== 🆕 EMBED FROM CONFIG =====================

  /**
   * 📋 Generate an embed from a configuration object
   * Useful for AI-generated or database-stored embed templates
   * @param {Object} config - { title, description, color, fields, footer, thumbnail, image, author, timestamp, url }
   * @param {string} config.type - 'success', 'error', 'warning', 'info', 'vip', 'economy', 'moderation'
   * @returns {EmbedBuilder}
   */
  fromConfig(config) {
    if (config.type && this[config.type]) {
      return this[config.type](config.title || '', config.description || '', config);
    }
    return this.base(config);
  }
}

module.exports = new EmbedBuilderUtils();