const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('metrics')
    .setDescription('View system resource metrics and stats'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('SelfImprovementAgent');
    if (!agent) return interaction.reply('❌ SelfImprovementAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};