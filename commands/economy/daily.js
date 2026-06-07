module.exports = {
  data: { name: 'daily', description: '🎁 Claim your daily reward' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};