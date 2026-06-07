module.exports = {
  data: { name: 'stats', description: '📊 Show bot statistics' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};