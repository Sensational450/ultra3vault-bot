const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('amaquestion')
    .setDescription('Submit a question for the AMA session')
    .addStringOption(opt => opt
      .setName('question')
      .setDescription('Your question about crypto, DeFi, trading, or the community')
      .setRequired(true)
      .setMaxLength(500)
    ),
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