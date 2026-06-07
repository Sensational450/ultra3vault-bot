module.exports = {
  data: { name: 'vip', description: '👑 Check your VIP status' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};