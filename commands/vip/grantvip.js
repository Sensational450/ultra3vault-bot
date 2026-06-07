module.exports = {
  data: {
    name: 'grantvip',
    description: '👑 Grant VIP to a user (Admin only)',
    options: [
      { name: 'user', type: 6, description: 'User', required: true },
      {
        name: 'tier',
        type: 3,
        description: 'Tier',
        required: true,
        choices: [
          { name: 'VIP', value: 'vip' },
          { name: 'Premium', value: 'premium' },
        ],
      },
      { name: 'days', type: 4, description: 'Duration in days', required: false },
    ],
  },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.grantvip', { interaction });
  },
};