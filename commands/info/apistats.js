const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apistats')
    .setDescription('View API usage statistics'),
  async execute(interaction, orchestrator) {
    const optAgent = orchestrator.getAgent('OptimizationAgent');
    if (!optAgent) return interaction.reply('❌ OptimizationAgent not loaded.');
    await optAgent.cmdApiStats(interaction);
  }
};