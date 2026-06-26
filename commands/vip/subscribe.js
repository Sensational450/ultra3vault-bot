const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('subscribe')
    .setDescription('💎 Subscribe to VIP or Premium with crypto (USD)')
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
      .setDescription('Select subscription duration')
      .setRequired(true)
      .addChoices(
        { name: '7 days', value: 7 },
        { name: '14 days', value: 14 },
        { name: '30 days', value: 30 }
      )
    ),

  async execute(interaction) {
    const tier = interaction.options.getString('tier');
    const days = interaction.options.getInteger('plan');

    const orchestrator = interaction.client.orchestrator;
    const vipAgent = orchestrator?.getAgent('VipAgent');

    if (!vipAgent) {
      return interaction.reply({ content: '❌ Subscription system is unavailable.', ephemeral: true });
    }

    // Calculate USD cost
    let usdCost;
    try {
      usdCost = vipAgent.getUsdCost(tier, days);
    } catch {
      return interaction.reply({ content: '❌ Invalid tier or plan.', ephemeral: true });
    }

    // Get tier display name
    const tierNames = { vip: 'VIP', premium: 'Premium' };

    // Emit event to start the payment flow (handled by your payment system)
    interaction.client.emit('vip.purchase.init', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      tier,
      days,
      usdCost,
    });

    await interaction.reply({
      content: `💳 **${tierNames[tier]}** subscription for **${days} days** — **$${usdCost.toFixed(2)}** USD\n\n📩 A payment link has been sent to your **Direct Messages**.\n_If you haven't received it, check your privacy settings._`,
      ephemeral: true,
    });
  }
};