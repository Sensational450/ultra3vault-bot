/**
 * 🎁 Daily Command v5.0
 * - Slash command for claiming daily rewards
 * - Emits 'command.daily' event for economyAgent to handle
 * - Includes cooldown awareness (handled by agent)
 */
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'daily',
    description: '🎁 Claim your daily reward',
  },

  /**
   * 🚀 Execute the command
   * - Defers reply to avoid interaction timeout
   * - Emits an event for the economy agent to process
   * @param {CommandInteraction} interaction
   * @param {Object} deps - { eventBus, logger, models? }
   */
  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;

    // Defer reply (may be overridden by agent if it replies sooner)
    await interaction.deferReply({ ephemeral: false });

    // Emit event for economyAgent to handle the actual reward logic
    if (eventBus) {
      eventBus.emit('command.daily', { interaction });
      logger?.debug(`📡 Daily command emitted for user ${interaction.user.id}`);
    } else {
      // Fallback if no eventBus (should not happen in production)
      logger?.warn('⚠️ No eventBus available for daily command');
      await interaction.editReply({ content: '❌ Daily rewards are temporarily unavailable.' });
    }
  },
};
