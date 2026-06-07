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
    const plan = interaction.options.getString('plan');
    await interaction.editReply(`✅ You selected plan: ${plan}. Payment system is being configured.`);
  },
};