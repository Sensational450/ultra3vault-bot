module.exports = {
  data: {
    name: 'newssubscribe',
    description: 'Subscribe to a news category',
    options: [
      {
        name: 'category',
        type: 3,
        description: 'News category',
        required: true,
        choices: [
          { name: 'Crypto News', value: 'cryptoNews' },
          { name: 'Airdrops', value: 'airdrops' },
          { name: 'Bitcoin News', value: 'bitcoinNews' },
          { name: 'Altcoin News', value: 'altcoinNews' },
          { name: 'Reddit', value: 'reddit' },
        ],
      },
      { name: 'channel', type: 7, description: 'Channel to send news', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};