const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trial')
    .setDescription('Claim a free trial for VIP or Premium features')
    .addSubcommand(sub => sub
      .setName('claim')
      .setDescription('Claim your free trial')
      .addStringOption(opt => opt
        .setName('tier')
        .setDescription('Which tier to try')
        .setRequired(true)
        .addChoices(
          { name: '💎 VIP', value: 'vip' },
          { name: '💎💎 Premium', value: 'premium' }
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check your trial status')
    )
    .addSubcommand(sub => sub
      .setName('admin')
      .setDescription('[Admin] Grant a trial to a user')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to grant trial to')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('tier')
        .setDescription('Tier to grant')
        .setRequired(true)
        .addChoices(
          { name: '💎 VIP', value: 'vip' },
          { name: '💎💎 Premium', value: 'premium' }
        )
      )
      .addIntegerOption(opt => opt
        .setName('days')
        .setDescription('Number of days (default: 3)')
        .setRequired(false)
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const vipAgent = interaction.client.orchestrator?.getAgent('VipAgent');
    if (!vipAgent) {
      return interaction.reply({ content: '❌ VipAgent not loaded.', ephemeral: true });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (sub === 'claim') {
      const tier = interaction.options.getString('tier');
      const days = tier === 'premium' ? 3 : 3; // configurable
      const result = await vipAgent.claimTrial(userId, guildId, tier, days);
      await interaction.reply({
        content: result.message,
        ephemeral: !result.success,
      });
    }

    else if (sub === 'status') {
      const status = await vipAgent.getTrialStatus(userId, guildId);
      let msg = '📋 **Trial Status**\n\n';
      if (status.active.length === 0) {
        msg += '❌ No active trials.\n';
      }
      for (const t of status.active) {
        const daysLeft = Math.ceil((t.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        msg += `• ${t.tier.toUpperCase()}: ${daysLeft} days left\n`;
      }
      msg += `\n📊 Total trials: ${status.total} (${status.expired} expired)`;
      await interaction.reply({ content: msg, ephemeral: true });
    }

    else if (sub === 'admin') {
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      const tier = interaction.options.getString('tier');
      const days = interaction.options.getInteger('days') || 3;
      const result = await vipAgent.adminGrantTrial(
        userId,
        target.id,
        guildId,
        tier,
        days
      );
      await interaction.reply({
        content: result.message || `✅ ${tier.toUpperCase()} trial granted to ${target} for ${days} days.`,
        ephemeral: true,
      });
    }
  }
};