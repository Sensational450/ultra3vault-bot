const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bothealth')
    .setDescription('View real‑time health status of all agents'),
  async execute(interaction, orchestrator) {
    const optAgent = orchestrator.getAgent('OptimizationAgent');
    if (!optAgent) return interaction.reply('❌ OptimizationAgent not loaded.');
    await optAgent.cmdHealth(interaction);
  }
};