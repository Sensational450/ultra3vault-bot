const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Summarize a long text or a recent news article')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Paste the text or URL you want summarized')
        .setRequired(true)
    ),

  async execute(interaction, orchestrator, { logger }) {
    const text = interaction.options.getString('text');
    await interaction.deferReply();

    try {
      // Find the SummaryAgent via orchestrator
      const summaryAgent = orchestrator.agents.find(
        a => a.constructor.name === 'SummaryAgent'
      );

      if (!summaryAgent) {
        return interaction.editReply('❌ SummaryAgent not loaded.');
      }

      const result = await summaryAgent.summarize(text, 60);
      await interaction.editReply(`📝 **Summary:**\n${result}`);
    } catch (err) {
      logger.error(`Summarize command failed: ${err.message}`);
      await interaction.editReply('❌ Sorry, I couldn\'t summarize that.');
    }
  }
};