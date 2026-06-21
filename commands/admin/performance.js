const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('performance')
    .setDescription('View real‑time agent performance analysis'),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('SelfImprovementAgent');
    if (!agent) return interaction.reply('❌ SelfImprovementAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};