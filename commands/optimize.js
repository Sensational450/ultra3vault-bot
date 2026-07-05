// commands/optimize.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('optimize')
    .setDescription('⚡ System optimization & operations center')

    // ── status ──
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('📊 Show optimization agent status')
    )

    // ── health ──
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('🩺 Show system health summary')
    )

    // ── report ──
    .addSubcommand(sub => sub
      .setName('report')
      .setDescription('📊 Generate and send a performance report')
    )

    // ── config group ──
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
            { name: 'CPU Threshold (%)', value: 'cpuThreshold' },
            { name: 'Error Threshold', value: 'errorThreshold' },
            { name: 'Slow Query Threshold (ms)', value: 'slowQueryThreshold' },
            { name: 'Event Loop Threshold (ms)', value: 'eventLoopThreshold' },
            { name: 'Inflation Target (%)', value: 'inflationTarget' },
            { name: 'Enable Self-Healing', value: 'enableSelfHealing' },
            { name: 'Enable Predictive Scaling', value: 'enablePredictiveScaling' },
            { name: 'Enable Cost Optimization', value: 'enableCostOptimization' },
            { name: 'Enable Engagement Optimization', value: 'enableEngagementOptimization' },
            { name: 'Enable Economy Optimization', value: 'enableEconomyOptimization' }
          )
        )
        .addStringOption(opt => opt
          .setName('value')
          .setDescription('New value')
          .setRequired(true)
        )
      )
    )

    // ── suggest ──
    .addSubcommand(sub => sub
      .setName('suggest')
      .setDescription('💡 Get optimization suggestions')
    )

    // ── NEW: system ──
    .addSubcommand(sub => sub
      .setName('system')
      .setDescription('🖥️ Show detailed system metrics (CPU, memory, event loop)')
    )

    // ── NEW: economy ──
    .addSubcommand(sub => sub
      .setName('economy')
      .setDescription('💰 Show economy health (inflation, rewards, activity)')
    )

    // ── NEW: engagement ──
    .addSubcommand(sub => sub
      .setName('engagement')
      .setDescription('📈 Show engagement metrics (best times, activity)')
    )

    // ── NEW: security ──
    .addSubcommand(sub => sub
      .setName('security')
      .setDescription('🔒 Show security audit results (permissions, suspicious activity)')
    )

    // ── NEW: coordination ──
    .addSubcommand(sub => sub
      .setName('coordination')
      .setDescription('🔄 Show current coordination flags (sensitivity, polling, rewards)')
    )

    // ── NEW: cost ──
    .addSubcommand(sub => sub
      .setName('cost')
      .setDescription('💰 Show API cost summary and usage')
    )

    // ── NEW: selfhealing ──
    .addSubcommand(sub => sub
      .setName('selfhealing')
      .setDescription('🔄 Show self-healing status and toggle')
      .addBooleanOption(opt => opt
        .setName('enable')
        .setDescription('Enable or disable self-healing')
        .setRequired(false)
      )
    ),

  async execute(interaction) {
    // Delegate to the agent
    await interaction.client.orchestrator.onInteraction(interaction);
  }
};