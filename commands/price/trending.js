const { LunarCrushAPI } = require('../../tools/api/lunarCrush');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'trending',
    description: '📈 Show trending coins by social activity',
  },
  async execute(interaction) {
    if (!process.env.LUNARCRUSH_API_KEY) {
      return interaction.reply({ content: 'Trending feature not configured.', ephemeral: true });
    }
    await interaction.deferReply();
    const api = new LunarCrushAPI({ apiKey: process.env.LUNARCRUSH_API_KEY, logger: console });
    const trending = await api.getTrendingCoins({ limit: 5 });
    if (!trending.length) {
      return interaction.editReply('No trending data available.');
    }
    const embed = new EmbedBuilder()
      .setTitle('🔥 Trending Coins')
      .setColor(0xff6600)
      .setTimestamp();
    for (const coin of trending) {
      embed.addFields({ name: `${coin.symbol} - ${coin.name}`, value: `Social Score: ${coin.socialScore}\nSentiment: ${coin.sentiment}`, inline: true });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};