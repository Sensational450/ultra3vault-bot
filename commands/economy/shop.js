const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: { name: 'shop', description: '🛒 View items for sale' },
  async execute(interaction) {
    // No need to defer – reply immediately
    const embed = new EmbedBuilder()
      .setTitle('🛒 Shop')
      .setDescription(
        '**VIP Role** - 5000 coins\nAccess to VIP channels\n\n' +
        '**Lottery Ticket** - 100 coins\nEnter the weekly lottery\n\n' +
        '**Red Name Color** - 2000 coins\nCustom role color'
      )
      .setColor(0xffaa00);
    await interaction.reply({ embeds: [embed] });
  },
};