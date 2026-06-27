const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('💼 Manage your fantasy portfolio')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View your portfolio')
    )
    .addSubcommand(sub =>
      sub.setName('buy')
        .setDescription('Buy an asset')
        .addStringOption(opt =>
          opt.setName('asset')
            .setDescription('Asset symbol (e.g., BTC)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('shares')
            .setDescription('Number of shares')
            .setRequired(true)
            .setMinValue(0.01)
        )
    )
    .addSubcommand(sub =>
      sub.setName('sell')
        .setDescription('Sell an asset')
        .addStringOption(opt =>
          opt.setName('asset')
            .setDescription('Asset symbol (e.g., BTC)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('shares')
            .setDescription('Number of shares')
            .setRequired(true)
            .setMinValue(0.01)
        )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};