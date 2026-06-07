module.exports = {
  data: {
    name: 'gamble',
    description: '🎲 Bet coins on a coin flip',
    options: [
      { name: 'amount', type: 4, description: 'Amount to bet', required: true },
    ],
  },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.gamble', { interaction });
  },
};