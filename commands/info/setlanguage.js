const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set your preferred language for bot responses')
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Language code (e.g., en, es, fr, de)')
        .setRequired(true)
    ),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('LocalizationAgent');
    if (!agent) return interaction.reply('❌ LocalizationAgent not loaded.');
    await agent.cmdSetLanguage(interaction);
  },
};