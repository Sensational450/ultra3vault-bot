module.exports = {
  data: { name: 'stats', description: '📊 Show bot statistics' },
  async execute(interaction) {
    await interaction.deferReply();
    await interaction.editReply('📊 Bot is running!');
  },
};