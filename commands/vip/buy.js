const { NowPaymentsAPI } = require('../../tools/api/nowpayments');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('💎 Purchase a VIP or Premium subscription with crypto')
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

    // Check API keys
    if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET) {
      await interaction.editReply({ content: '❌ Payment system not configured. Please contact administrator.' });
      return;
    }

    // Get VipAgent to fetch pricing
    const vipAgent = interaction.client.orchestrator?.getAgent('VipAgent');
    if (!vipAgent) {
      await interaction.editReply({ content: '❌ Subscription system unavailable.' });
      return;
    }

    let usdCost;
    try {
      usdCost = vipAgent.getUsdCost(tier, days);
    } catch (err) {
      await interaction.editReply({ content: `❌ Invalid tier or plan: ${err.message}` });
      return;
    }

    const nowpayments = new NowPaymentsAPI({
      apiKey: process.env.NOWPAYMENTS_API_KEY,
      ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
      sandbox: process.env.NODE_ENV !== 'production',
      logger: console,
    });

    try {
      const orderId = `${userId}_${tier}_${days}d`;
      const description = `Ultra3Vault ${tier.toUpperCase()} ${days}‑day subscription`;

      const invoice = await nowpayments.createInvoice({
        amount: usdCost,
        priceCurrency: 'usd',
        orderId,
        orderDescription: description,
        successUrl: 'https://google.com',
        cancelUrl: 'https://google.com',
        // Add metadata for webhook (optional, but can help)
        metadata: {
          userId,
          guildId,
          tier,
          days,
        },
      });

      await interaction.editReply({
        content: `💳 **${tier.toUpperCase()}** subscription for **${days} days** — **$${usdCost.toFixed(2)}** USD\n\n🔗 [Pay here](${invoice.invoice_url})\n\n_Once payment is confirmed, your role will be automatically assigned._`,
      });
    } catch (err) {
      console.error('❌ Invoice creation failed:', err);
      await interaction.editReply({ content: `❌ Failed to create payment link: ${err.message}` });
    }
  },
};