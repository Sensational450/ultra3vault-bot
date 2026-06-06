/**
 * 🛒 Shop Command v5.0
 * - Display available items for purchase
 * - Emits 'command.shop' event for economyAgent
 */
module.exports = {
  data: {
    name: 'shop',
    description: '🛒 View items available for purchase',
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: false });
    if (eventBus) {
      eventBus.emit('command.shop', { interaction });
      logger?.debug(`📡 Shop command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Shop unavailable.' });
    }
  },
};