module.exports = {
  data: { name: 'ping', description: '🏓 Check bot latency' },
  async execute(interaction) {
    await interaction.deferReply(); // MUST defer first
    await interaction.editReply('🏓 Pong!');
  },
};