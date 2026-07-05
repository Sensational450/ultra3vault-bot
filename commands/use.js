const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('🎒 Use an item from your inventory')
    .addStringOption(opt => opt
      .setName('item')
      .setDescription('Item ID (e.g., lottery_ticket, xp_boost_1h)')
      .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};