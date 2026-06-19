module.exports = {
  data: {
    name: 'set-welcome-channel',
    description: 'Set the channel for welcome messages (Admin only)',
    options: [
      { name: 'channel', type: 7, description: 'Text channel', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};
