/**
 * 🔥 Trending Protocols Command v5.0
 * - Fetches top DeFi protocols by TVL change from DeFi Llama
 * - Displays protocol name, chain, and TVL in billions
 */
const { EmbedBuilder } = require('discord.js');
const { DefiLlamaAPI } = require('../../tools/api/defillama');

module.exports = {
  data: {
    name: 'trending-protocols',
    description: '🔥 Shows top DeFi protocols by TVL change',
  },
  async execute(interaction) {
    await interaction.deferReply();

    const api = new DefiLlamaAPI({ logger: console });
    const protocols = await api.getTrendingProtocols();

    if (!protocols || protocols.length === 0) {
      return interaction.editReply('❌ Could not fetch trending protocols. Please try again later.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 Trending DeFi Protocols')
      .setDescription('Top protocols by 1‑day TVL change')
      .setColor(0x00ff00)
      .setTimestamp();

    // Show top 5 protocols
    for (const p of protocols.slice(0, 5)) {
      const tvlB = (p.tvl / 1e9).toFixed(2);
      embed.addFields({
        name: p.name,
        value: `**TVL:** $${tvlB}B\n**Chain:** ${p.chain}`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
