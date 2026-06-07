module.exports = {
  data: {
    name: 'revokevip',
    description: '🔨 Revoke VIP from a user (Admin only)',
    options: [
      { name: 'user', type: 6, description: 'User', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};