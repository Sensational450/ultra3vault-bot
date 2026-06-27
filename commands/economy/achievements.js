const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('🏅 View your unlocked achievements'),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};