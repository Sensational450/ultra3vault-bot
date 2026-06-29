/**
 * tools/discord/webhookSender.js
 * Utility for sending messages via Discord webhooks with consistent Ultra3Vault styling.
 * Supports retries, rate‑limit handling, and keep‑alive connections.
 */
const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('../../core/logger');

// Keep‑alive agents for better performance under load
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000, // 15s timeout
});

class WebhookSender {
  /**
   * Send a payload to a Discord webhook URL
   * @param {string} webhookUrl - Full Discord webhook URL (from env or fetched)
   * @param {Object} payload - Discord webhook payload (content, embeds, username, etc.)
   * @param {Object} [options] - Additional options
   * @param {string} [options.threadId] - Thread ID to send to (forum/thread)
   * @param {boolean} [options.wait] - Wait for confirmation (returns message object)
   * @param {string} [options.username] - Override webhook username
   * @param {string} [options.avatarURL] - Override webhook avatar
   * @param {number} [retries=3] - Max retry attempts
   * @returns {Promise<Object>} - Discord API response data
   */
  static async send(webhookUrl, payload, options = {}, retries = 3) {
    if (!webhookUrl) throw new Error('Webhook URL is required');

    // Convert EmbedBuilder objects to plain objects
    if (payload.embeds) {
      payload.embeds = payload.embeds.map(embed =>
        embed?.toJSON ? embed.toJSON() : embed
      );
    }

    // Merge username/avatar overrides if provided in options
    if (options.username) payload.username = options.username;
    if (options.avatarURL) payload.avatar_url = options.avatarURL;

    // Build URL with query parameters
    let url = webhookUrl;
    const params = new URLSearchParams();
    if (options.threadId) params.set('thread_id', options.threadId);
    if (options.wait) params.set('wait', 'true');
    if (params.toString()) url += `?${params.toString()}`;

    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
      try {
        const response = await axiosInstance.post(url, payload, {
          headers: { 'Content-Type': 'application/json' },
        });
        logger.debug(`Webhook sent successfully (${url.slice(0, 60)}...)`);
        return response.data;
      } catch (error) {
        lastError = error;
        attempt++;
        const status = error.response?.status;
        const isRateLimit = status === 429;
        const retryAfter = error.response?.data?.retry_after || 1;
        // For rate limits, use Discord's suggested delay; otherwise exponential backoff
        const delay = isRateLimit
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt - 1);

        logger.warn(
          `Webhook send attempt ${attempt}/${retries} failed (status ${status}): ${error.message}`
        );

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    const errMsg = lastError?.response?.data?.message || lastError?.message || 'Unknown error';
    logger.error(`Webhook send failed after ${retries} attempts: ${errMsg}`);
    throw lastError || new Error('Webhook send failed');
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