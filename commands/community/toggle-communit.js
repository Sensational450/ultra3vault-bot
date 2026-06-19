module.exports = {
  data: {
    name: 'toggle-community',
    description: 'Enable or disable Community Manager (Admin only)',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};