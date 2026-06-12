/**
 * 📈 Sentiment Command v5.0
 * - Fetches social sentiment for a given coin (e.g., BTC, ETH)
 * - Uses LunarCrush API (requires LUNARCRUSH_API_KEY)
 * - Only available to VIP/Premium members (optional, you can remove the check)
 */
const { EmbedBuilder } = require('discord.js');
const { LunarCrushAPI } = require('../../tools/api/lunarCrush');

module.exports = {
  data: {
    name: 'sentiment',
    description: '📊 Get social sentiment for a cryptocurrency (VIP feature)',
    options: [
      {
        name: 'coin',
        type: 3,
        description: 'Coin symbol (e.g., BTC, ETH, SOL)',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    // Optional: Check if user has VIP/Premium role (uncomment and adjust role IDs)
    // const vipRoleId = process.env.VIP_ROLE_ID;
    // const premiumRoleId = process.env.PREMIUM_ROLE_ID;
    // const hasSubscription = interaction.member.roles.cache.has(vipRoleId) || interaction.member.roles.cache.has(premiumRoleId);
    // if (!hasSubscription) {
    //   return interaction.reply({ content: '❌ This command is for VIP/Premium members only. Use `/buy` to upgrade.', ephemeral: true });
    // }

    await interaction.deferReply();

    const coinSymbol = interaction.options.getString('coin').toUpperCase();
    const apiKey = process.env.LUNARCRUSH_API_KEY;

    if (!apiKey) {
      return interaction.editReply({ content: '❌ Sentiment feature not configured (missing API key).' });
    }

    const api = new LunarCrushAPI({ apiKey, logger: console });
    const sentiment = await api.getCoinSentiment(coinSymbol);

    if (!sentiment) {
      return interaction.editReply({ content: `❌ Could not fetch sentiment for ${coinSymbol}. Check symbol or try again later.` });
    }

    // Determine sentiment emoji and color
    let sentimentEmoji = '😐';
    let sentimentColor = 0xaaaaaa;
    if (sentiment.sentiment === 'positive') {
      sentimentEmoji = '😊';
      sentimentColor = 0x00ff00;
    } else if (sentiment.sentiment === 'negative') {
      sentimentEmoji = '😠';
      sentimentColor = 0xff0000;
    } else if (sentiment.sentiment === 'bullish') {
      sentimentEmoji = '🐂';
      sentimentColor = 0x00ae86;
    } else if (sentiment.sentiment === 'bearish') {
      sentimentEmoji = '🐻';
      sentimentColor = 0xff6600;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${sentimentEmoji} ${sentiment.name} (${sentiment.symbol}) Sentiment`)
      .addFields(
        { name: '📊 Social Score', value: sentiment.socialScore?.toFixed(1) || 'N/A', inline: true },
        { name: '💬 Sentiment', value: sentiment.sentiment?.toUpperCase() || 'Neutral', inline: true },
        { name: '🐂 Bullish Intensity', value: sentiment.bullishIntensity?.toFixed(1) || 'N/A', inline: true },
        { name: '🐻 Bearish Intensity', value: sentiment.bearishIntensity?.toFixed(1) || 'N/A', inline: true },
        { name: '📝 Posts (24h)', value: sentiment.posts24h?.toLocaleString() || 'N/A', inline: true },
        { name: '❤️ Interactions (24h)', value: sentiment.interactions24h?.toLocaleString() || 'N/A', inline: true }
      )
      .setColor(sentimentColor)
      .setFooter({ text: 'Data from LunarCrush' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};