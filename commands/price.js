module.exports = {
  data: {
    name: 'price',
    description: '💰 Get current crypto price',
    options: [
      { name: 'coin', type: 3, description: 'Coin ID (e.g., bitcoin)', required: false },
    ],
  },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.price', { interaction });
  },
};