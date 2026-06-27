const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 View the leaderboard')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Type of leaderboard')
        .setRequired(false)
        .addChoices(
          { name: '💰 Coins', value: 'coins' },
          { name: '📊 XP', value: 'xp' }
        )
    ),
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};