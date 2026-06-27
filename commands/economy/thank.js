const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('thank')
    .setDescription('🙏 Give a reputation point to a helpful user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to thank')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};