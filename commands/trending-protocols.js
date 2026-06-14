// 📁 commands/trending-protocols.js
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

    if (!protocols.length) {
      return interaction.editReply('Could not fetch trending protocols.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🔥 Trending DeFi Protocols')
      .setColor(0x00ff00)
      .setTimestamp();

    protocols.slice(0, 5).forEach(protocol => {
      embed.addFields({
        name: protocol.name,
        value: `**TVL**: $${(protocol.tvl / 1e9).toFixed(2)}B\n**Chain**: ${protocol.chain}`,
        inline: true,
      });
    });

    await interaction.editReply({ embeds: [embed] });
  },
};