const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('missions')
    .setDescription('🎯 View your daily mission progress'),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};