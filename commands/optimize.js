const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('optimize')
    .setDescription('⚡ System optimization & operations center')
    // ---- status ----
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('📊 Show optimization agent status')
    )
    // ---- health ----
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('🩺 Show system health')
    )
    // ---- report ----
    .addSubcommand(sub => sub
      .setName('report')
      .setDescription('📊 Generate and send a performance report')
    )
    // ---- config group ----
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('⚙️ Manage optimization configuration')
      .addSubcommand(sub => sub
        .setName('show')
        .setDescription('Show current configuration')
      )
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(opt => opt
          .setName('key')
          .setDescription('Config key')
          .setRequired(true)
          .addChoices(
            { name: 'Memory Threshold (%)', value: 'memoryThreshold' },
            { name: 'Error Threshold', value: 'errorThreshold' },
            { name: 'Slow Query Threshold (ms)', value: 'slowQueryThreshold' },
            { name: 'Restart Cooldown (ms)', value: 'restartCooldownMs' }
          )
        )
        .addStringOption(opt => opt.setName('value').setDescription('New value').setRequired(true))
      )
    )
    // ---- suggest ----
    .addSubcommand(sub => sub
      .setName('suggest')
      .setDescription('💡 Get optimization suggestions')
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};