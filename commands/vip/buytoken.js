const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buytoken')
    .setDescription('💰 Unlock VIP or Premium using economy tokens')
    .addStringOption(opt => opt
      .setName('tier')
      .setDescription('Choose your tier')
      .setRequired(true)
      .addChoices(
        { name: 'VIP', value: 'vip' },
        { name: 'Premium', value: 'premium' }
      )
    )
    .addIntegerOption(opt => opt
      .setName('plan')
      .setDescription('Subscription duration')
      .setRequired(true)
      .addChoices(
        { name: '7 days', value: 7 },
        { name: '14 days', value: 14 },
        { name: '30 days', value: 30 }
      )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('plan');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const orchestrator = interaction.client.orchestrator;
    const vipAgent = orchestrator?.getAgent('VipAgent');
    const economyAgent = orchestrator?.getAgent('EconomyAgent');

    if (!vipAgent || !economyAgent) {
      return interaction.editReply({ content: '❌ Required systems not available.' });
    }

    // Get token cost
    let tokenCost;
    try {
      tokenCost = vipAgent.getTokenCost(tier, days);
    } catch (err) {
      return interaction.editReply({ content: `❌ Invalid tier or plan: ${err.message}` });
    }

    // Check balance first (optional: show confirmation)
    const balance = await economyAgent.getBalance(userId, guildId);
    if (balance < tokenCost) {
      return interaction.editReply({
        content: `❌ Insufficient tokens. You need **${tokenCost}** tokens, but you have **${balance}**. Earn more via \`/daily\` or \`/referral\`.`,
      });
    }

    // Attempt purchase
    try {
      const result = await vipAgent.purchaseWithTokens(
        userId,
        guildId,
        tier,
        days,
        economyAgent
      );
      await interaction.editReply({ content: result.message });
    } catch (err) {
      await interaction.editReply({ content: `❌ Purchase failed: ${err.message}` });
    }
  },
};