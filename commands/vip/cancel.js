module.exports = {
  data: { name: 'cancel', description: '❌ Cancel your subscription' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};