module.exports = {
  data: { name: 'cancel', description: '❌ Cancel your subscription' },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.cancel', { interaction });
  },
};