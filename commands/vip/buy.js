const { NowPaymentsAPI } = require('../../tools/api/nowpayments');

module.exports = {
  data: {
    name: 'buy',
    description: '💎 Purchase a VIP subscription',
    options: [
      {
        name: 'plan',
        type: 3,
        description: 'Subscription plan',
        required: true,
        choices: [
          { name: '7 days', value: '7d' },
          { name: '14 days', value: '14d' },
          { name: '30 days', value: '30d' },
        ],
      },
    ],
  },
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    console.log('🟢 Step 1: Deferred reply');

    const plan = interaction.options.getString('plan');
    const userId = interaction.user.id;
    console.log(`🟢 Step 2: plan=${plan}, userId=${userId}`);

    // Check API keys
    if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET) {
      console.error('❌ Step 3: Missing NowPayments API keys');
      await interaction.editReply({ content: '❌ Payment system not configured. Please contact administrator.' });
      return;
    }
    console.log('🟢 Step 3: API keys are present');

    const nowpayments = new NowPaymentsAPI({
      apiKey: process.env.NOWPAYMENTS_API_KEY,
      ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
      sandbox: process.env.NODE_ENV !== 'production',
      logger: console,
    });
    console.log('🟢 Step 4: NowPaymentsAPI instance created');

    try {
      const amount = plan === '7d' ? 5 : (plan === '14d' ? 9 : 15);
      const orderId = `${userId}_${plan}`;
      console.log(`🟢 Step 5: amount=${amount}, orderId=${orderId}`);

      const invoice = await nowpayments.createInvoice({
        amount,
        priceCurrency: 'usd',
        orderId,
        orderDescription: `Ultra3Vault ${plan} subscription`,
        successUrl: 'https://google.com',
        cancelUrl: 'https://google.com',
      });
      console.log('🟢 Step 6: Invoice created', invoice);

      await interaction.editReply({
        content: `💰 Invoice created!\nPay here: ${invoice.invoice_url}\n\n_Once payment is confirmed, your VIP role will be automatically assigned._`,
      });
    } catch (err) {
      console.error('💥 Step 7: Invoice creation failed', err);
      await interaction.editReply({ content: `❌ Failed to create payment link: ${err.message}` });
    }
  },
};