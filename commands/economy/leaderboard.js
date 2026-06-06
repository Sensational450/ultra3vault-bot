/**
 * 🏆 Leaderboard Command v5.0
 * - Display top users by balance
 * - Optional: pagination (handled by agent)
 * - Emits 'command.leaderboard' event for economyAgent
 */
module.exports = {
  data: {
    name: 'leaderboard',
    description: '🏆 Show richest users in the server',
    options: [
      {
        name: 'page',
        type: 4, // INTEGER
        description: 'Page number (default 1)',
        required: false,
      },
    ],
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: false });
    if (eventBus) {
      eventBus.emit('command.leaderboard', { interaction });
      logger?.debug(`📡 Leaderboard command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Leaderboard unavailable.' });
    }
  },
};