const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contentcalendar')
    .setDescription('View the weekly content calendar'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('ContentPlanningAgent');
    if (!agent) return interaction.reply('❌ ContentPlanningAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};