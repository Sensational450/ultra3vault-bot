const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('📊 Create a poll with button voting (Admin only)')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('The poll question')
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption(opt =>
      opt.setName('options')
        .setDescription('Comma-separated options (e.g., "BTC,ETH,SOL")')
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post the poll (defaults to current)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(0), // Admin only

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};
