module.exports = {
  data: { name: 'inventory', description: '📦 Show your items' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};