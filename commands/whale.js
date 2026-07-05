const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whale')
    .setDescription('🐋 Whale tracking & analysis commands')
    // ---- stats ----
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('📊 Show whale statistics (last 7 days)')
    )
    // ---- top ----
    .addSubcommand(sub => sub
      .setName('top')
      .setDescription('🏆 Show largest whale transactions')
      .addIntegerOption(opt => opt
        .setName('limit')
        .setDescription('Number of transactions to show (default 5)')
        .setMinValue(1)
        .setMaxValue(25)
      )
    )
    // ---- wallet ----
    .addSubcommand(sub => sub
      .setName('wallet')
      .setDescription('🔍 Show transactions involving a wallet')
      .addStringOption(opt => opt
        .setName('address')
        .setDescription('Wallet address (ETH, BTC, etc.)')
        .setRequired(true)
      )
    )
    // ---- history ----
    .addSubcommand(sub => sub
      .setName('history')
      .setDescription('📜 Show recent whale transactions')
      .addIntegerOption(opt => opt
        .setName('limit')
        .setDescription('Number of transactions to show (default 5)')
        .setMinValue(1)
        .setMaxValue(25)
      )
    )
    // ---- setmin ----
    .addSubcommand(sub => sub
      .setName('setmin')
      .setDescription('💰 Set your personal minimum alert value (in USD)')
      .addNumberOption(opt => opt
        .setName('min')
        .setDescription('Minimum USD value (e.g., 1000000 for $1M)')
        .setRequired(true)
        .setMinValue(0)
      )
    )
    // ---- watch ----
    .addSubcommand(sub => sub
      .setName('watch')
      .setDescription('👀 Manage your wallet watchlist')
      .addStringOption(opt => opt
        .setName('address')
        .setDescription('Wallet address')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('action')
        .setDescription('Add or remove')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
      )
    )
    // ---- ignore ----
    .addSubcommand(sub => sub
      .setName('ignore')
      .setDescription('🚫 Ignore a wallet (stop receiving alerts from it)')
      .addStringOption(opt => opt
        .setName('address')
        .setDescription('Wallet address to ignore')
        .setRequired(true)
      )
    )
    // ---- chains ----
    .addSubcommand(sub => sub
      .setName('chains')
      .setDescription('⛓️ Set your preferred blockchains')
      .addStringOption(opt => opt
        .setName('chains')
        .setDescription('Comma-separated chain names (e.g., ethereum,arbitrum)')
        .setRequired(true)
      )
    )
    // ---- status ----
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('📊 Show whale agent health status')
    ),

  async execute(interaction) {
    // Forward to the orchestrator, which will route to the WhaleAgent
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};