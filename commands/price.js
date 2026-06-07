module.exports = {
  data: {
    name: 'price',
    description: '💰 Get current crypto price',
    options: [
      { name: 'coin', type: 3, description: 'Coin ID (e.g., bitcoin)', required: false },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};