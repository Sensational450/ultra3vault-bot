const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('🔥 View your daily claim streak'),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};