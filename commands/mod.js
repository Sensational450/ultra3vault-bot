const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛡️ Moderation commands (AI, cases, reputation, stats, config)')
    // ---- warn ----
    .addSubcommand(sub => sub
      .setName('warn')
      .setDescription('Warn a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    // ---- warnings ----
    .addSubcommand(sub => sub
      .setName('warnings')
      .setDescription('View warnings for a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
    )
    // ---- clearwarns ----
    .addSubcommand(sub => sub
      .setName('clearwarns')
      .setDescription('Clear all warnings for a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
    )
    // ---- mute ----
    .addSubcommand(sub => sub
      .setName('mute')
      .setDescription('Mute a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('minutes').setDescription('Duration in minutes').setRequired(false))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    // ---- kick ----
    .addSubcommand(sub => sub
      .setName('kick')
      .setDescription('Kick a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    // ---- ban ----
    .addSubcommand(sub => sub
      .setName('ban')
      .setDescription('Ban a user')
      .addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    // ---- purge ----
    .addSubcommand(sub => sub
      .setName('purge')
      .setDescription('Delete messages in current channel')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true).setMinValue(1).setMaxValue(100))
    )
    // ---- config group ----
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('⚙️ Moderation configuration (admin)')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a config value')
        .addStringOption(opt => opt
          .setName('key')
          .setDescription('Config key')
          .setRequired(true)
          .addChoices(
            { name: 'Max Warnings', value: 'maxWarnings' },
            { name: 'Mute Duration (ms)', value: 'muteDurationMs' },
            { name: 'Spam Threshold', value: 'spamThreshold' },
            { name: 'Raid Threshold', value: 'raidThreshold' },
            { name: 'Enable AI', value: 'enableAI' },
            { name: 'Enable Web3 Security', value: 'enableWeb3Security' },
            { name: 'Enable Reputation', value: 'enableReputation' },
            { name: 'Autonomous Actions', value: 'autonomousActions' },
            { name: 'Min Confidence', value: 'minConfidence' }
          )
        )
        .addStringOption(opt => opt.setName('value').setDescription('New value').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('show')
        .setDescription('Show current config')
      )
    )
    // ---- cases group ----
    .addSubcommandGroup(group => group
      .setName('cases')
      .setDescription('📋 Case management')
      .addSubcommand(sub => sub
        .setName('view')
        .setDescription('View cases for a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('search')
        .setDescription('Search cases by keyword')
        .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(true))
      )
    )
    // ---- reputation ----
    .addSubcommand(sub => sub
      .setName('reputation')
      .setDescription('🌟 View user reputation')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    )
    // ---- stats ----
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('📊 Show moderation stats')
    )
    // ---- health ----
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('🩺 Show agent health')
    )
    // ---- appeal ----
    .addSubcommand(sub => sub
      .setName('appeal')
      .setDescription('📩 Submit an appeal for a moderation action')
      .addStringOption(opt => opt.setName('case').setDescription('Case ID').setRequired(true))
      .addStringOption(opt => opt.setName('message').setDescription('Appeal message').setRequired(true))
    ),

  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};