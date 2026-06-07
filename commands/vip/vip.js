module.exports = {
  data: { name: 'vip', description: '👑 Check your VIP status' },
  async execute(interaction) {
    const { eventBus } = interaction.client;
    eventBus?.emit('command.vip', { interaction });
  },
};