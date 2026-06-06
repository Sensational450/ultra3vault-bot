/**
 * 💬 MessageCreate Event v5.0
 * - Forwards every message to the orchestrator
 * - Ignores bot messages (to prevent loops)
 * - Optional: logs message activity for debugging
 * - Can be extended to skip certain channels or users
 */
module.exports = (client, orchestrator, options = {}) => {
  const { logger, ignoreBots = true, ignoreDMs = false } = options;

  client.on('messageCreate', async (message) => {
    // 🚫 Ignore bot messages (prevent loops)
    if (ignoreBots && message.author.bot) return;

    // 🚫 Optionally ignore direct messages
    if (ignoreDMs && !message.guild) return;

    // 📡 Forward to orchestrator
    try {
      await orchestrator.onMessage(message);
      if (logger) logger.debug(`📬 Message from ${message.author.tag} in ${message.guild?.name || 'DM'}`);
    } catch (err) {
      logger?.error(`❌ Error in messageCreate handler: ${err.message}`);
    }
  });
};
