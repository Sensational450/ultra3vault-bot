module.exports = {
  data: {
    name: 'setpricechannel',
    description: 'Set the channel for price alerts (Admin only)',
    options: [
      { name: 'channel', type: 7, description: 'The text channel', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};
