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
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('AMAAgent');
    if (!agent) return interaction.reply('❌ AMAAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};