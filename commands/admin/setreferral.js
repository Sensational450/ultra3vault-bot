module.exports = {
  data: {
    name: 'setreferral',
    description: '⚙️ Configure referral rewards (Admin only)',
    options: [
      {
        name: 'setreward',
        type: 1, // SUB_COMMAND
        description: 'Set reward amount for referral',
        options: [
          {
            name: 'type',
            type: 3,
            description: 'Reward type',
            required: true,
            choices: [
              { name: 'Referrer coins', value: 'referrer_coins' },
              { name: 'Referee coins', value: 'referee_coins' },
              { name: 'Referrer VIP days', value: 'referrer_vip_days' },
              { name: 'Referee VIP days', value: 'referee_vip_days' },
            ],
          },
          {
            name: 'amount',
            type: 4,
            description: 'Amount (coins or days)',
            required: true,
            min_value: 0,
          },
        ],
      },
      {
        name: 'resetweekly',
        type: 1,
        description: 'Enable/disable weekly leaderboard reset',
        options: [
          {
            name: 'enable',
            type: 5,
            description: 'Enable or disable',
            required: true,
          },
        ],
      },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};