module.exports = {
  data: { name: 'balance', description: '💰 Check your coin balance' },
  async execute(interaction) {
    const { eventBus } = interaction.client; // assuming eventBus attached to client
    eventBus?.emit('command.balance', { interaction });
  },
};