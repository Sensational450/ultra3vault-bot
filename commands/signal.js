const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('signal')
    .setDescription('📈 Advanced trading signals & tools')
    // ---- health ----
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('📊 Show SignalAgent health status')
    )
    // ---- stats ----
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('📈 Show signal performance stats (win rate, ROI)')
    )
    // ---- watch ----
    .addSubcommand(sub => sub
      .setName('watch')
      .setDescription('👀 Manage your signal watchlist')
      .addStringOption(opt => opt
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' }
        )
      )
      .addStringOption(opt => opt
        .setName('coin')
        .setDescription('Coin symbol (e.g., BTC) – required for add/remove')
      )
    )
    // ---- portfolio ----
    .addSubcommand(sub => sub
      .setName('portfolio')
      .setDescription('💼 View your virtual portfolio')
    )
    // ---- buy ----
    .addSubcommand(sub => sub
      .setName('buy')
      .setDescription('💹 Buy shares in paper trading')
      .addStringOption(opt => opt
        .setName('coin')
        .setDescription('Coin symbol (e.g., BTC)')
        .setRequired(true)
      )
      .addNumberOption(opt => opt
        .setName('shares')
        .setDescription('Number of shares to buy')
        .setRequired(true)
        .setMinValue(0.0001)
      )
    )
    // ---- sell ----
    .addSubcommand(sub => sub
      .setName('sell')
      .setDescription('💹 Sell shares in paper trading')
      .addStringOption(opt => opt
        .setName('coin')
        .setDescription('Coin symbol (e.g., BTC)')
        .setRequired(true)
      )
      .addNumberOption(opt => opt
        .setName('shares')
        .setDescription('Number of shares to sell')
        .setRequired(true)
        .setMinValue(0.0001)
      )
    )
    // ---- market ----
    .addSubcommand(sub => sub
      .setName('market')
      .setDescription('📊 Show top gainers & losers (24h)')
    )
    // ---- leaderboard ----
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('🏆 Show top signal traders leaderboard')
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};