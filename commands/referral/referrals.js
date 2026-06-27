module.exports = {
  data: {
    name: 'referrals',
    description: '📊 View your referral stats and recent referrals',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};