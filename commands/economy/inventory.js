module.exports = {
  data: { name: 'inventory', description: '📦 Show your items' },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.inventory', { interaction });
  },
};