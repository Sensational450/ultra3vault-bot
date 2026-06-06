/**
 * 🎁 Daily Command v5.0
 * - Claim daily reward
 * - Emits 'command.daily' event for economyAgent
 */
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'daily',
    description: '🎁 Claim your daily reward',
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: false });
    if (eventBus) {
      eventBus.emit('command.daily', { interaction });
      logger?.debug(`📡 Daily command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Daily rewards unavailable.' });
    }
  },
};
