const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text to any supported language')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text to translate')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Target language code (e.g., en, es, fr, de)')
        .setRequired(true)
    ),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('LocalizationAgent');
    if (!agent) return interaction.reply('❌ LocalizationAgent not loaded.');
    await agent.cmdTranslate(interaction);
  },
};