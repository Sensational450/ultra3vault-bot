/**
 * 🎮 InteractionCreate Event v5.0
 * - Routes slash commands to orchestrator (for agents to handle)
 * - Routes button interactions to buttonHandler (if provided)
 * - Routes select menus and modals (extensible)
 * - Ignores interactions from bots
 */
module.exports = (client, orchestrator, options = {}) => {
  const { logger, buttonHandler } = options;

  client.on('interactionCreate', async (interaction) => {
    // 🚫 Ignore bot interactions (shouldn't happen, but safe)
    if (interaction.user?.bot) return;

    try {
      // 🎮 Handle slash commands via orchestrator
      if (interaction.isCommand()) {
        logger?.debug(`📡 Slash command: ${interaction.commandName} from ${interaction.user.tag}`);
        await orchestrator.onInteraction(interaction);
      }
      // 🔘 Handle button interactions via buttonHandler (if available)
      else if (interaction.isButton() && buttonHandler) {
        logger?.debug(`🔘 Button interaction: ${interaction.customId} from ${interaction.user.tag}`);
        await buttonHandler.handle(interaction);
      }
      // 📋 Handle select menus (optional – can also go to orchestrator)
      else if (interaction.isStringSelectMenu() && buttonHandler) {
        logger?.debug(`📋 Select menu: ${interaction.customId} from ${interaction.user.tag}`);
        // You can extend buttonHandler to handle select menus, or pass to orchestrator
        await buttonHandler.handleSelect?.(interaction) || orchestrator.onInteraction(interaction);
      }
      // 🧾 Handle modal submits
      else if (interaction.isModalSubmit()) {
        logger?.debug(`🧾 Modal submit: ${interaction.customId} from ${interaction.user.tag}`);
        await orchestrator.onInteraction(interaction);
      }
      // ❓ Unknown interaction type
      else {
        logger?.warn(`⚠️ Unhandled interaction type: ${interaction.type} from ${interaction.user.tag}`);
      }
    } catch (err) {
      logger?.error(`❌ Error in interactionCreate handler: ${err.message}`);
      // Attempt to reply with error if interaction hasn't been replied to
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred while processing this interaction.', ephemeral: true }).catch(() => {});
      }
    }
  });
};