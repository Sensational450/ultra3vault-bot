/**
 * 💰 Balance Command v5.0
 * - Check your own or another user's coin balance
 * - Emits 'command.balance' event for economyAgent
 */
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'balance',
    description: '💰 Check your coin balance',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'User to check (default: yourself)',
        required: false,
      },
    ],
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: true });
    if (eventBus) {
      eventBus.emit('command.balance', { interaction });
      logger?.debug(`📡 Balance command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Balance check unavailable.' });
    }
  },
};