const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postcontent')
    .setDescription('Manually post content to a channel')
    .addStringOption(opt => opt
      .setName('type')
      .setDescription('Type of content')
      .setRequired(true)
      .addChoices(
        { name: '📚 Education', value: 'education' },
        { name: '🧠 Trivia', value: 'trivia' },
        { name: '💡 Quote', value: 'quote' },
        { name: '🤔 Question', value: 'question' },
        { name: '📊 Market', value: 'market' },
        { name: '💎 VIP', value: 'vip' },
        { name: '💎💎 Premium', value: 'premium' }
      )
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to post in (defaults to current)')
      .setRequired(false)
    ),
  async execute(interaction, orchestrator) {
    const agent = orchestrator.getAgent('ContentPlanningAgent');
    if (!agent) return interaction.reply('❌ ContentPlanningAgent not loaded.');
    await agent.onInteraction(interaction);
  }
};
