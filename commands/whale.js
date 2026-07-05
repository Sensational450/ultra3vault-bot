const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whale')
    .setDescription('🐋 On-Chain Intelligence – whale tracking, analytics, and more')
    // ---- status ----
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('📊 Show whale agent health status')
    )
    // ---- stats ----
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('📊 Show whale statistics (last 7 days)')
    )
    // ---- top ----
    .addSubcommand(sub => sub
      .setName('top')
      .setDescription('🏆 Show largest whale transactions')
      .addIntegerOption(opt => opt.setName('limit').setDescription('Number of transactions').setMinValue(1).setMaxValue(25))
    )
    // ---- history ----
    .addSubcommand(sub => sub
      .setName('history')
      .setDescription('📜 Show recent whale transactions')
      .addIntegerOption(opt => opt.setName('limit').setDescription('Number of transactions').setMinValue(1).setMaxValue(25))
    )
    // ---- watch group ----
    .addSubcommandGroup(group => group
      .setName('watch')
      .setDescription('👀 Manage your whale watchlist')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add a wallet to your watchlist')
        .addStringOption(opt => opt.setName('address').setDescription('Wallet address').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Remove a wallet from your watchlist')
        .addStringOption(opt => opt.setName('address').setDescription('Wallet address').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('List your watched wallets')
      )
    )
    // ---- ignore ----
    .addSubcommand(sub => sub
      .setName('ignore')
      .setDescription('🚫 Ignore a wallet (stop receiving alerts)')
      .addStringOption(opt => opt.setName('address').setDescription('Wallet address').setRequired(true))
    )
    // ---- predict ----
    .addSubcommand(sub => sub
      .setName('predict')
      .setDescription('🔮 Vote sentiment on a whale transaction')
      .addStringOption(opt => opt.setName('tx').setDescription('Transaction hash').setRequired(true))
      .addStringOption(opt => opt
        .setName('sentiment')
        .setDescription('Bullish or bearish')
        .setRequired(true)
        .addChoices(
          { name: 'Bullish', value: 'bullish' },
          { name: 'Bearish', value: 'bearish' }
        )
      )
    )
    // ---- leaderboard ----
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('🏆 Show prediction leaderboard')
    )
    // ---- wallet group ----
    .addSubcommandGroup(group => group
      .setName('wallet')
      .setDescription('🔍 Wallet analytics')
      .addSubcommand(sub => sub
        .setName('view')
        .setDescription('View wallet transaction history')
        .addStringOption(opt => opt.setName('address').setDescription('Wallet address').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('score')
        .setDescription('Get a wallet activity score')
        .addStringOption(opt => opt.setName('address').setDescription('Wallet address').setRequired(true))
      )
    )
    // ---- portfolio group ----
    .addSubcommandGroup(group => group
      .setName('portfolio')
      .setDescription('💼 Your whale portfolio')
      .addSubcommand(sub => sub
        .setName('view')
        .setDescription('View your portfolio summary')
      )
    )
    // ---- config group (admin) ----
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('⚙️ Admin configuration')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(opt => opt.setName('key').setDescription('Config key').setRequired(true)
          .addChoices(
            { name: 'Min Alert Value (USD)', value: 'minValue' },
            { name: 'Alert Channel', value: 'alertChannel' },
            { name: 'Premium Only', value: 'premiumOnly' }
          )
        )
        .addStringOption(opt => opt.setName('value').setDescription('Value').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('show')
        .setDescription('Show current configuration')
      )
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};