module.exports = {
  data: { name: 'test', description: 'Test command' },
  async execute(interaction) {
    await interaction.reply('Test works!');
  },
};