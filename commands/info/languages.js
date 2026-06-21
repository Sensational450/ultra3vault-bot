const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('languages')
    .setDescription('List all supported languages'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('LocalizationAgent');
    if (!agent) return interaction.reply('❌ LocalizationAgent not loaded.');
    await agent.cmdLanguages(interaction);
  },
};