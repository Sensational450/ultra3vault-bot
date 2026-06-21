const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('amasummary')
    .setDescription('View recent AMA questions and answers'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('AMAAgent');
    if (!agent) return interaction.reply('❌ AMAAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};