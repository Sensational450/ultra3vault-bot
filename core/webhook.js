/**
 * core/webhook.js
 * Centralized webhook configuration and sender.
 * All agents should import sendWebhook from here.
 */
const WebhookSender = require('../tools/discord/webhookSender');
const logger = require('./logger');

// Webhook mapping: logical key → env var value
const WEBHOOKS = {
  announcements: process.env.ANNOUNCEMENTS_WEBHOOK_URL,
  cryptoNews: process.env.NEWS_WEBHOOK_URL,
  whaleAlerts: process.env.WHALE_WEBHOOK_URL,
  priceAlerts: process.env.PRICE_WEBHOOK_URL,
  leaderboard: process.env.LEADERBOARD_WEBHOOK_URL,
  socialFeed: process.env.SOCIAL_FEED_WEBHOOK_URL,
  vipNews: process.env.VIP_WEBHOOK_URL,
  vipGiveaways: process.env.VIP_GIVEAWAY_WEBHOOK_URL,
  premiumSignals: process.env.PREMIUM_SIGNAL_WEBHOOK_URL,
  premiumAirdrops: process.env.PREMIUM_AIRDROP_WEBHOOK_URL,
  modLog: process.env.MODLOG_WEBHOOK_URL,
  ama: process.env.AMA_WEBHOOK_URL,
  giveaways: process.env.GIVEAWAY_WEBHOOK_URL,
};

/**
 * Send a message via webhook by logical key.
 * @param {string} key - Logical key (e.g., 'whaleAlerts', 'vipNews')
 * @param {string|object} payload - Content string or Discord payload object
 * @param {object} [options] - Extra options (threadId, wait, username, avatarURL)
 * @returns {Promise<void>}
 */
async function sendWebhook(key, payload, options = {}) {
  const url = WEBHOOKS[key];
  if (!url) {
    logger.warn(`⚠️ Webhook URL missing for key: ${key}`);
    return;
  }
  try {
    await WebhookSender.send(url, payload, options);
  } catch (err) {
    logger.error(`Webhook send failed (${key}): ${err.message}`);
  }
}

module.exports = { WEBHOOKS, sendWebhook };