module.exports = {
  data: {
    name: 'refer',
    description: '🔗 Get your referral code and stats',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};
