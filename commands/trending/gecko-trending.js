/**
 * 🔥 Gecko Trending Command v5.0
 * - Fetches trending coins from CoinGecko (search/trending endpoint)
 * - Displays rank, name, symbol, and market cap rank
 */
const { EmbedBuilder } = require('discord.js');
const { CoinGeckoAPI } = require('../../tools/api/coingecko');

module.exports = {
  data: {
    name: 'gecko-trending',
    description: '🔥 Shows trending coins on CoinGecko',
  },
  async execute(interaction) {
    await interaction.deferReply();

    const coingecko = new CoinGeckoAPI({ logger: console });
    const trending = await coingecko.getTrendingCoins();

    if (!trending || trending.length === 0) {
      return interaction.editReply('❌ Could not fetch trending coins. Please try again later.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 CoinGecko Trending')
      .setDescription('Top 5 trending coins right now')
      .setColor(0xffaa00)
      .setTimestamp();

    for (let i = 0; i < Math.min(trending.length, 5); i++) {
      const coin = trending[i];
      embed.addFields({
        name: `${i + 1}. ${coin.name} (${coin.symbol.toUpperCase()})`,
        value: `Market cap rank: #${coin.marketCapRank || 'N/A'}`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};