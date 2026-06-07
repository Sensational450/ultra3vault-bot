module.exports = {
  data: { name: 'balance', description: '💰 Check your coin balance' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};