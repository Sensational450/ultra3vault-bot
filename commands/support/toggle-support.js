module.exports = {
  data: {
    name: 'toggle-support',
    description: 'Enable or disable support AI (Admin only)',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};