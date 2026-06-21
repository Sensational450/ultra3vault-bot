const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('detect')
    .setDescription('Detect the language of a text')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text to detect')
        .setRequired(true)
        .setMaxLength(500)
    ),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('LocalizationAgent');
    if (!agent) return interaction.reply('❌ LocalizationAgent not loaded.');
    await agent.cmdDetect(interaction);
  },
};