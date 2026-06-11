module.exports = {
  data: {
    name: 'testnews',
    description: 'Send a test news post to verify subscription (Admin only)',
    options: [
      {
        name: 'category',
        type: 3,
        description: 'News category',
        required: false,
        choices: [
          { name: 'Crypto News', value: 'cryptoNews' },
          { name: 'Airdrops', value: 'airdrops' },
          { name: 'Bitcoin News', value: 'bitcoinNews' },
          { name: 'Altcoin News', value: 'altcoinNews' },
          { name: 'Reddit', value: 'reddit' },
        ],
      },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};