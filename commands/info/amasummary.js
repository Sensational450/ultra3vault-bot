const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('amasummary')
    .setDescription('View recent AMA questions and answers'),
  async execute(interaction) {
    const orchestrator = interaction.client.orchestrator;
    if (!orchestrator) {
      return interaction.reply({ content: '❌ Orchestrator not available.', ephemeral: true });
    }
    const agent = orchestrator.getAgent('AMAAgent');
    if (!agent) {
      return interaction.reply({ content: '❌ AMAAgent not loaded.', ephemeral: true });
    }
    await agent.onInteraction(interaction);
  }
};