const { EmbedBuilder } = require('discord.js');
const { DefiLlamaAPI } = require('../../tools/api/defillama');

module.exports = {
  data: {
    name: 'global-tvl',
    description: '🌍 Shows total value locked across all DeFi chains',
  },
  async execute(interaction) {
    await interaction.deferReply();
    const api = new DefiLlamaAPI({ logger: console });
    const data = await api.getGlobalTVL();
    if (!data) return interaction.editReply('Could not fetch global TVL.');
    const tvlB = (data.tvl / 1e9).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle('🌍 Global DeFi TVL')
      .setDescription(`**$${tvlB}B**`)
      .addFields(
        { name: '📊 Chains', value: data.chainsCount.toString(), inline: true },
        { name: '🔗 Protocols', value: data.protocolsCount.toString(), inline: true }
      )
      .setColor(0x00ae86);
    await interaction.editReply({ embeds: [embed] });
  },
};
