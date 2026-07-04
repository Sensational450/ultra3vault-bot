/**
 * tools/discord/webhookSender.js
 * Utility for sending messages via Discord webhooks with consistent Ultra3Vault styling.
 * Supports retries, rate‑limit handling, keep‑alive connections, and request tracing.
 */
const axios = require('axios');
const http = require('http');
const https = require('https');

// ─── Defensive logger (prevents "logger.warn is not a function") ───
let logger;
try {
  logger = require('../../core/logger');
} catch (err) {
  console.warn('[WebhookSender] Logger not found, falling back to console');
  logger = {
    debug: (...args) => console.debug('[WebhookSender DEBUG]', ...args),
    info: (...args) => console.info('[WebhookSender INFO]', ...args),
    warn: (...args) => console.warn('[WebhookSender WARN]', ...args),
    error: (...args) => console.error('[WebhookSender ERROR]', ...args),
  };
}

// ─── Keep‑alive agents with connection limits ───
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 60000,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 60000,
});

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000, // 15s timeout
  maxContentLength: 10 * 1024 * 1024, // 10MB max response
});

// ─── Request ID generator ───
let _requestId = 0;
function generateRequestId() {
  return `${Date.now().toString(36)}-${(++_requestId).toString(36)}`;
}

class WebhookSender {
  /**
   * Send a payload to a Discord webhook URL
   * @param {string} webhookUrl - Full Discord webhook URL
   * @param {Object} payload - Discord webhook payload
   * @param {Object} [options] - Additional options
   * @param {string} [options.threadId] - Thread ID
   * @param {boolean} [options.wait] - Wait for confirmation
   * @param {string} [options.username] - Override webhook username
   * @param {string} [options.avatarURL] - Override webhook avatar
   * @param {number} [retries=3] - Max retry attempts
   * @returns {Promise<Object>} - Discord API response data
   */
  static async send(webhookUrl, payload, options = {}, retries = 3) {
    const requestId = generateRequestId();
    const shortUrl = webhookUrl.slice(0, 60) + '...';

    if (!webhookUrl) {
      const err = new Error('Webhook URL is required');
      logger.error(`[${requestId}] ${err.message}`);
      throw err;
    }

    // ─── Validate payload size ───
    const contentLength = payload.content?.length || 0;
    if (contentLength > 2000) {
      logger.warn(`[${requestId}] Content exceeds 2000 chars (${contentLength}), truncating...`);
      payload.content = payload.content.slice(0, 1997) + '...';
    }

    if (payload.embeds?.length > 10) {
      logger.warn(`[${requestId}] Too many embeds (${payload.embeds.length}), limiting to 10`);
      payload.embeds = payload.embeds.slice(0, 10);
    }

    // ─── Convert EmbedBuilder objects to plain objects ───
    if (payload.embeds) {
      payload.embeds = payload.embeds.map((embed) =>
        embed?.toJSON ? embed.toJSON() : embed
      );
    }

    // ─── Merge username/avatar overrides ───
    if (options.username) payload.username = options.username;
    if (options.avatarURL) payload.avatar_url = options.avatarURL;

    // ─── Build URL with query parameters ───
    let url = webhookUrl;
    const params = new URLSearchParams();
    if (options.threadId) params.set('thread_id', options.threadId);
    if (options.wait) params.set('wait', 'true');
    if (params.toString()) url += `?${params.toString()}`;

    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
      try {
        logger.debug(`[${requestId}] Attempt ${attempt + 1}/${retries} sending to ${shortUrl}`);

        const response = await axiosInstance.post(url, payload, {
          headers: { 'Content-Type': 'application/json' },
        });

        // ─── Validate response ───
        if (response.status === 204) {
          // No content (success, no body)
          logger.debug(`[${requestId}] Webhook sent successfully (204 No Content)`);
          return { success: true };
        }

        if (response.status >= 200 && response.status < 300) {
          logger.debug(`[${requestId}] Webhook sent successfully`);
          return response.data || { success: true };
        }

        // If we get here, Discord returned an unexpected status
        const errorData = response.data;
        throw new Error(`Discord returned ${response.status}: ${JSON.stringify(errorData)}`);
      } catch (error) {
        lastError = error;
        attempt++;

        const status = error.response?.status;
        const responseData = error.response?.data || {};
        const isRateLimit = status === 429;
        const retryAfter = responseData.retry_after || 1; // Discord returns seconds

        // ─── Rate limit handling with jitter ───
        let delay;
        if (isRateLimit) {
          // Discord's suggested delay in seconds, convert to ms + jitter
          const baseDelay = retryAfter * 1000;
          const jitter = Math.random() * 500;
          delay = baseDelay + jitter;
          logger.warn(
            `[${requestId}] ⏳ Rate limited (429), waiting ${(delay / 1000).toFixed(1)}s (Discord retry_after: ${retryAfter}s)`
          );
        } else {
          // Exponential backoff with jitter for other errors
          const baseDelay = 1000 * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 200;
          delay = Math.min(baseDelay + jitter, 30000); // Cap at 30s
          logger.warn(
            `[${requestId}] Attempt ${attempt}/${retries} failed (status ${status}): ${error.message}`
          );
        }

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // ─── All retries exhausted ───
    const errMsg =
      lastError?.response?.data?.message ||
      lastError?.message ||
      'Unknown error';
    const errStatus = lastError?.response?.status || 'unknown';

    logger.error(
      `[${requestId}] ❌ Webhook send failed after ${retries} attempts (status ${errStatus}): ${errMsg}`
    );

    // If we have a rate limit error, include the retry_after in the thrown error
    if (lastError?.response?.status === 429) {
      const retryAfter = lastError.response.data?.retry_after || 1;
      const enhancedError = new Error(`Rate limited: retry after ${retryAfter}s`);
      enhancedError.retryAfter = retryAfter;
      enhancedError.status = 429;
      throw enhancedError;
    }

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
   * @param {string} options.authorName - Author name
   * @param {string} options.authorIcon - Author icon URL
   * @param {string} options.authorUrl - Author URL
   * @param {Date|number} options.timestamp - Custom timestamp
   * @returns {Object} - Plain embed object ready for Discord API
   */
  static buildUltraEmbed({
    title,
    description,
    url,
    image,
    thumbnail,
    fields = [],
    color = 0x00ff88, // Ultra3Vault signature green
    footer,
    authorName,
    authorIcon,
    authorUrl,
    timestamp,
  }) {
    const embed = {
      color,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    };

    if (title) embed.title = title;
    if (description) embed.description = description;
    if (url) embed.url = url;
    if (image) embed.image = { url: image };
    if (thumbnail) embed.thumbnail = { url: thumbnail };
    if (footer) {
      embed.footer = {
        text: footer,
      };
    }
    if (authorName) {
      embed.author = {
        name: authorName,
      };
      if (authorIcon) embed.author.icon_url = authorIcon;
      if (authorUrl) embed.author.url = authorUrl;
    }
    if (fields && fields.length) {
      embed.fields = fields.slice(0, 25);
    }

    return embed;
  }

  /**
   * Quick send helper for a single embed with Ultra3Vault styling.
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Object} embedOptions - Options for buildUltraEmbed
   * @param {Object} [options] - Additional send options
   * @param {number} [retries=3] - Retry count
   * @returns {Promise<Object>}
   */
  static async sendUltraEmbed(webhookUrl, embedOptions, options = {}, retries = 3) {
    const embed = this.buildUltraEmbed(embedOptions);
    return this.send(webhookUrl, { embeds: [embed] }, options, retries);
  }

  /**
   * Send a simple text message (non-embed) via webhook.
   * @param {string} webhookUrl - Discord webhook URL
   * @param {string} content - Message content (max 2000 chars)
   * @param {Object} [options] - Additional send options
   * @param {number} [retries=3] - Retry count
   * @returns {Promise<Object>}
   */
  static async sendText(webhookUrl, content, options = {}, retries = 3) {
    if (content.length > 2000) {
      logger.warn(`Text content exceeds 2000 chars (${content.length}), truncating...`);
      content = content.slice(0, 1997) + '...';
    }
    return this.send(webhookUrl, { content }, options, retries);
  }

  /**
   * Send a message with multiple embeds (up to 10).
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Array<Object>} embedOptionsList - Array of options for buildUltraEmbed
   * @param {Object} [options] - Additional send options
   * @param {number} [retries=3] - Retry count
   * @returns {Promise<Object>}
   */
  static async sendMultipleEmbeds(webhookUrl, embedOptionsList, options = {}, retries = 3) {
    const embeds = embedOptionsList.slice(0, 10).map((opts) =>
      this.buildUltraEmbed(opts)
    );
    return this.send(webhookUrl, { embeds }, options, retries);
  }
}

module.exports = WebhookSender;