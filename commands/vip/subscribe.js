 module.exports = {
  data: {
    name: 'subscribe',
    description: '💎 Subscribe to a VIP tier',
    options: [
      {
        name: 'tier',
        type: 3,
        description: 'Tier (vip / premium)',
        required: true,
        choices: [
          { name: 'VIP', value: 'vip' },
          { name: 'Premium', value: 'premium' },
        ],
      },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};