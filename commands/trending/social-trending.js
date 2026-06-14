/**
 * 📱 Social Trends Command v5.0
 * - Fetches trending crypto topics from LunarCrush (social activity)
 * - Requires LUNARCRUSH_API_KEY environment variable
 * - Shows topics with social score and sentiment
 */
const { EmbedBuilder } = require('discord.js');
const { LunarCrushAPI } = require('../../tools/api/lunarCrush');

module.exports = {
  data: {
    name: 'social-trends',
    description: '📱 Shows trending crypto topics on social media',
  },
  async execute(interaction) {
    await interaction.deferReply();

    const apiKey = process.env.LUNARCRUSH_API_KEY;
    if (!apiKey) {
      return interaction.editReply('❌ Social trends feature not configured (missing API key).');
    }

    const api = new LunarCrushAPI({ apiKey, logger: console });
    const trending = await api.getTrendingCoins(10);

    if (!trending || trending.length === 0) {
      return interaction.editReply('❌ Could not fetch social trends. Please try again later.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📱 Social Media Trends')
      .setDescription('Top trending crypto assets by social activity')
      .setColor(0x1da1f2) // Twitter blue
      .setTimestamp();

    for (let i = 0; i < Math.min(trending.length, 5); i++) {
      const coin = trending[i];
      const sentimentEmoji = coin.sentiment === 'positive' ? '😊' : coin.sentiment === 'negative' ? '😠' : '😐';
      embed.addFields({
        name: `${i + 1}. ${coin.name} (${coin.symbol.toUpperCase()})`,
        value: `📊 Social Score: ${coin.socialScore?.toFixed(1) || 'N/A'}\n${sentimentEmoji} Sentiment: ${coin.sentiment || 'Neutral'}`,
        inline: true,
      });
    }

    embed.setFooter({ text: 'Data from LunarCrush • Social activity score based on posts, interactions, and followers' });
    await interaction.editReply({ embeds: [embed] });
  },
};