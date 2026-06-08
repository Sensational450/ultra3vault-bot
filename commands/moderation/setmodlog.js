module.exports = {
  data: {
    name: 'setmodlog',
    description: 'Set the channel for moderation logs (Admin only)',
    options: [
      { name: 'channel', type: 7, description: 'The text channel', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};
