module.exports = {
  data: { name: 'renew', description: '🔄 Renew your subscription' },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.renew', { interaction });
  },
};