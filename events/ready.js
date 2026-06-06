/**
 * 🤖 Ready Event v5.0
 * - Called when Discord client is ready
 * - Notifies orchestrator (agents can perform startup tasks)
 * - Optionally registers slash commands
 * - Logs bot info and uptime
 */
module.exports = async (client, orchestrator, options = {}) => {
  const { logger, registerCommands } = options;

  client.once('ready', async () => {
    logger?.info(`✅ Logged in as ${client.user.tag} (${client.user.id})`);
    logger?.info(`🌍 Serving ${client.guilds.cache.size} guilds and ${client.users.cache.size} users`);

    // 📡 Notify orchestrator (agents can implement onReady)
    try {
      await orchestrator.onReady();
      logger?.debug('📡 Orchestrator notified of ready event');
    } catch (err) {
      logger?.error(`❌ Error notifying orchestrator: ${err.message}`);
    }

    // 📜 Register slash commands if a register function is provided
    if (registerCommands && typeof registerCommands === 'function') {
      try {
        await registerCommands();
        logger?.info('✅ Slash commands registered');
      } catch (err) {
        logger?.error(`❌ Failed to register commands: ${err.message}`);
      }
    }

    // 🎉 Bot is ready
    logger?.info('🚀 Bot is fully operational');
  });
};