/**
 * 🎮 InteractionCreate Event v5.0
 * - Routes slash commands to orchestrator (for agents to handle)
 * - Routes button interactions to buttonHandler (if provided)
 * - Routes select menus and modals (extensible)
 * - Ignores interactions from bots
 * - Fallback reply for unhandled commands to avoid "application did not respond"
 */
module.exports = (client, orchestrator, options = {}) => {
  const { logger, buttonHandler } = options;

  client.on('interactionCreate', async (interaction) => {
    // 🚫 Ignore bot interactions
    if (interaction.user?.bot) return;

    try {
      // 🎮 Handle slash commands via orchestrator
      if (interaction.isCommand()) {
        logger?.debug(`📡 Slash command: ${interaction.commandName} from ${interaction.user.tag}`);
        // Defer the reply immediately to avoid timeout if agents take time
        // But note: some agents may already defer; we'll only defer if not already deferred
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: false }).catch(() => {});
        }
        await orchestrator.onInteraction(interaction);
      }
      // 🔘 Handle button interactions via buttonHandler (if available)
      else if (interaction.isButton() && buttonHandler) {
        logger?.debug(`🔘 Button interaction: ${interaction.customId} from ${interaction.user.tag}`);
        await buttonHandler.handle(interaction);
      }
      // 📋 Handle select menus
      else if (interaction.isStringSelectMenu() && buttonHandler) {
        logger?.debug(`📋 Select menu: ${interaction.customId} from ${interaction.user.tag}`);
        await (buttonHandler.handleSelect?.(interaction) || orchestrator.onInteraction(interaction));
      }
      // 🧾 Handle modal submits
      else if (interaction.isModalSubmit()) {
        logger?.debug(`🧾 Modal submit: ${interaction.customId} from ${interaction.user.tag}`);
        await orchestrator.onInteraction(interaction);
      }
      // ❓ Unknown interaction type
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