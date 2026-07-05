const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('📊 Economy administration (admin only)')
    .addSubcommand(sub => sub.setName('status').setDescription('Show economy status'))
    .addSubcommand(sub => sub
      .setName('adjust')
      .setDescription('Adjust economy parameters')
      .addStringOption(opt => opt.setName('type').setDescription('Parameter').setRequired(true)
        .addChoices(
          { name: 'Daily Min', value: 'dailyMin' },
          { name: 'Daily Max', value: 'dailyMax' },
          { name: 'Mission Coins Factor (%)', value: 'missionCoins' }
        )
      )
      .addNumberOption(opt => opt.setName('value').setDescription('New value').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('inject')
      .setDescription('Inject coins to a user')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('burn')
      .setDescription('Burn coins from treasury')
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('pause').setDescription('Pause economy'))
    .addSubcommand(sub => sub.setName('resume').setDescription('Resume economy'))
    .addSubcommand(sub => sub
      .setName('rollback')
      .setDescription('Rollback a transaction')
      .addIntegerOption(opt => opt.setName('id').setDescription('Transaction ID').setRequired(true))
    ),
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};