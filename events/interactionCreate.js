/**
 * 🎮 InteractionCreate Event v5.0
 * - Routes slash commands to orchestrator (no global deferral)
 * - Routes button interactions to buttonHandler (if provided)
 * - Routes select menus and modals (extensible)
 * - Ignores interactions from bots
 */
module.exports = (client, orchestrator, options = {}) => {
  const { logger, buttonHandler } = options;

  client.on('interactionCreate', async (interaction) => {
    if (interaction.user?.bot) return;

    try {
      if (interaction.isCommand()) {
        logger?.debug(`📡 Slash command: ${interaction.commandName} from ${interaction.user.tag}`);
        // Do NOT defer here – let the command file handle deferral if needed
        await orchestrator.onInteraction(interaction);
      }
      else if (interaction.isButton() && buttonHandler) {
        logger?.debug(`🔘 Button interaction: ${interaction.customId} from ${interaction.user.tag}`);
        await buttonHandler.handle(interaction);
      }
      else if (interaction.isStringSelectMenu() && buttonHandler) {
        logger?.debug(`📋 Select menu: ${interaction.customId} from ${interaction.user.tag}`);
        await (buttonHandler.handleSelect?.(interaction) || orchestrator.onInteraction(interaction));
      }
      else if (interaction.isModalSubmit()) {
        logger?.debug(`🧾 Modal submit: ${interaction.customId} from ${interaction.user.tag}`);
        await orchestrator.onInteraction(interaction);
      }
      else {
        logger?.warn(`⚠️ Unhandled interaction type: ${interaction.type} from ${interaction.user.tag}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ This interaction type is not supported.', ephemeral: true }).catch(() => {});
        }
      }
    } catch (err) {
      logger?.error(`❌ Error in interactionCreate handler: ${err.message}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred while processing this interaction.', ephemeral: true }).catch(() => {});
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred while processing your request.' }).catch(() => {});
      }
    }
  });
};