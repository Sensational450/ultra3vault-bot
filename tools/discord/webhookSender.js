/**
 * tools/discord/webhookSender.js
 * Utility for sending messages via Discord webhooks with consistent Ultra3Vault styling.
 */
const axios = require('axios');

class WebhookSender {
  /**
   * Send a payload to a Discord webhook URL
   * @param {string} webhookUrl - Full Discord webhook URL (from env or fetched)
   * @param {Object} payload - Discord webhook payload (content, embeds, username, etc.)
   * @returns {Promise<Object>} - Discord API response data
   */
  static async send(webhookUrl, payload) {
    if (!webhookUrl) throw new Error('Webhook URL is required');

    // Ensure embeds are in the correct format (if they are EmbedBuilder objects, call .toJSON())
    if (payload.embeds) {
      payload.embeds = payload.embeds.map(embed =>
        embed?.toJSON ? embed.toJSON() : embed
      );
    }

    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message;
      console.error(`[WebhookSender] Send failed: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Build a consistent Ultra3Vault embed structure.
   * @param {Object} options
   * @param {string} options.title - Embed title
   * @param {string} options.description - Main text
   * @param {string} options.url - Optional link
   * @param {string} options.image - Image URL
   * @param {string} options.thumbnail - Thumbnail URL
   * @param {Array<{name, value, inline}>} options.fields - Up to 25 fields
   * @param {number} options.color - Hex color (decimal)
   * @param {string} options.footer - Footer text
   * @returns {Object} - Plain embed object ready for Discord API
   */
  static buildUltraEmbed({
    title,
    description,
    url,
    image,
    thumbnail,
    fields = [],
    color = 0x00ff88,
    footer,
  }) {
    const embed = {
      color,
      title: title || '📰 Update',
      description: description || '',
      url: url || null,
      timestamp: new Date().toISOString(),
      footer: {
        text: footer || `Ultra3Vault • ${new Date().toLocaleString()}`,
      },
    };

    if (image) embed.image = { url: image };
    if (thumbnail) embed.thumbnail = { url: thumbnail };
    if (fields && fields.length) {
      embed.fields = fields.slice(0, 25);
    }

    return embed;
  }
}

module.exports = WebhookSender;