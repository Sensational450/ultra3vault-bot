const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('predictprice')
    .setDescription('🔮 Make a price prediction for an asset')
    .addStringOption(opt =>
      opt.setName('asset')
        .setDescription('Asset symbol (e.g., BTC, ETH, SOL)')
        .setRequired(true)
    )
    .addNumberOption(opt =>
      opt.setName('price')
        .setDescription('Target price in USD')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};