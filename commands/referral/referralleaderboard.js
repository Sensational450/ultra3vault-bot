module.exports = {
  data: {
    name: 'referralleaderboard',
    description: '🏆 View the top referrers in the server',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};