const { EmbedBuilder } = require('discord.js');
const { DefiLlamaAPI } = require('../../tools/api/defillama');

module.exports = {
  data: {
    name: 'chain-tvl',
    description: '⛓️ Shows TVL for a specific blockchain',
    options: [
      {
        name: 'chain',
        type: 3,
        description: 'Blockchain name (e.g., Ethereum, Solana)',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    await interaction.deferReply();
    const chain = interaction.options.getString('chain');
    const api = new DefiLlamaAPI({ logger: console });
    const data = await api.getChainTVL(chain);
    if (!data) return interaction.editReply(`No data found for chain "${chain}".`);
    const tvlB = (data.tvl / 1e9).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle(`⛓️ ${data.name} TVL`)
      .setDescription(`**$${tvlB}B**`)
      .addFields(
        { name: '🔒 Market Cap', value: `$${(data.marketCap / 1e9).toFixed(2)}B` || 'N/A', inline: true },
        { name: '📊 24h Change', value: `${data.change_24h?.toFixed(2) || 'N/A'}%`, inline: true }
      )
      .setColor(0x9b59b6);
    await interaction.editReply({ embeds: [embed] });
  },
};