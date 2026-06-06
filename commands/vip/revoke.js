/**
 * 🔨 Revoke Command v5.0
 * - Revoke a user's VIP subscription (admin only)
 * - Emits 'command.revoke' event for vipAgent to handle permission checks and revocation
 */
module.exports = {
  data: {
    name: 'revoke',
    description: '🔨 Revoke a user\'s VIP subscription (Admin only)',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'User to revoke VIP from',
        required: true,
      },
    ],
    // Optional: set default permission to false, but we'll let agent check
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger } = deps;
    await interaction.deferReply({ ephemeral: true });
    if (eventBus) {
      eventBus.emit('command.revoke', { interaction });
      logger?.debug(`📡 Revoke command emitted for user ${interaction.user.id}`);
    } else {
      await interaction.editReply({ content: '❌ Revocation system unavailable.' });
    }
  },
};