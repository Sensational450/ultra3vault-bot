module.exports = {
  data: { name: 'leaderboard', description: '🏆 Show richest users' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};