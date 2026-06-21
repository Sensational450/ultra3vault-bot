const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('predict')
    .setDescription('Predict error rates for the next 24 hours'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('SelfImprovementAgent');
    if (!agent) return interaction.reply('❌ SelfImprovementAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};