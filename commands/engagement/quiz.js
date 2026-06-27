const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('🧠 Create a quiz with button answers (Admin only)')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('The quiz question')
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption(opt =>
      opt.setName('options')
        .setDescription('Comma-separated options (e.g., "BTC,ETH,SOL,ADA")')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('correct')
        .setDescription('Index of correct answer (0-3)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(3)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post the quiz (defaults to current)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(0), // Admin only

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};