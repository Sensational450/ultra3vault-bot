/**
 * 🎨 EmbedBuilder v5.0
 * - Reusable embed templates (success, error, warning, info, custom)
 * - Standard colors and emojis
 * - Helper methods for fields, footers, timestamps
 * - Support for message components (buttons) via options
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class EmbedBuilderUtils {
  constructor() {
    // 🎨 Standard color palette
    this.colors = {
      success: 0x2ecc71,  // green
      error: 0xe74c3c,    // red
      warning: 0xf39c12,  // orange
      info: 0x3498db,     // blue
      vip: 0x9b59b6,      // purple
      economy: 0xf1c40f,  // gold
      moderation: 0xe67e22, // dark orange
    };
  }

  /**
   * 📦 Base embed method – applies common options
   * @param {Object} options - { title, description, color, fields, footer, thumbnail, image, author, timestamp }
   * @returns {EmbedBuilder}
   */
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
    return embed;
  }

  /**
   * ✅ Success embed (green)
   * @param {string} title
   * @param {string} description
   * @param {Object} options - extra fields, footer, etc.
   * @returns {EmbedBuilder}
   */
  success(title, description, options = {}) {
    return this.base({
      title: `✅ ${title}`,
      description,
      color: this.colors.success,
      ...options,
    });
  }

  /**
   * ❌ Error embed (red)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  error(title, description, options = {}) {
    return this.base({
      title: `❌ ${title}`,
      description,
      color: this.colors.error,
      ...options,
    });
  }

  /**
   * ⚠️ Warning embed (orange)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  warning(title, description, options = {}) {
    return this.base({
      title: `⚠️ ${title}`,
      description,
      color: this.colors.warning,
      ...options,
    });
  }

  /**
   * ℹ️ Info embed (blue)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  info(title, description, options = {}) {
    return this.base({
      title: `ℹ️ ${title}`,
      description,
      color: this.colors.info,
      ...options,
    });
  }

  /**
   * 💎 VIP embed (purple)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  vip(title, description, options = {}) {
    return this.base({
      title: `💎 ${title}`,
      description,
      color: this.colors.vip,
      ...options,
    });
  }

  /**
   * 💰 Economy embed (gold)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  economy(title, description, options = {}) {
    return this.base({
      title: `💰 ${title}`,
      description,
      color: this.colors.economy,
      ...options,
    });
  }

  /**
   * 🛡️ Moderation embed (dark orange)
   * @param {string} title
   * @param {string} description
   * @param {Object} options
   * @returns {EmbedBuilder}
   */
  moderation(title, description, options = {}) {
    return this.base({
      title: `🛡️ ${title}`,
      description,
      color: this.colors.moderation,
      ...options,
    });
  }

  /**
   * 🧪 Custom embed with full control
   * @param {Object} options - all EmbedBuilder options (title, description, color, fields, etc.)
   * @returns {EmbedBuilder}
   */
  custom(options = {}) {
    return this.base(options);
  }

  /**
   * ➕ Helper: Add a field row (inline by default)
   * @param {EmbedBuilder} embed
   * @param {string} name
   * @param {string} value
   * @param {boolean} inline
   * @returns {EmbedBuilder}
   */
  addField(embed, name, value, inline = true) {
    embed.addFields({ name, value, inline });
    return embed;
  }

  /**
   * 📋 Helper: Create a simple embed with just a description (for quick messages)
   * @param {string} description
   * @param {string} type - 'success', 'error', 'warning', 'info'
   * @returns {EmbedBuilder}
   */
  simple(description, type = 'info') {
    const method = this[type] || this.info;
    return method(type.charAt(0).toUpperCase() + type.slice(1), description);
  }

  /**
   * 🔘 Helper: Create a button row (for action embeds)
   * @param {Array} buttons - [{ label, style, customId, url?, emoji? }]
   * @returns {ActionRowBuilder}
   */
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
   * 📊 Helper: Create a field from an object (key-value pairs)
   * @param {Object} obj - Key-value pairs to display as fields
   * @param {Array<string>} order - Optional field order
   * @returns {Array<{name: string, value: string, inline: boolean}>}
   */
  objectToFields(obj, order = null, inline = true) {
    const keys = order || Object.keys(obj);
    return keys.map(key => ({
      name: key,
      value: String(obj[key] ?? '—'),
      inline,
    }));
  }
}

module.exports = new EmbedBuilderUtils();
