module.exports = {
  data: {
    name: 'set-support-channel',
    description: 'Set the channel for support questions (Admin only)',
    options: [
      { name: 'channel', type: 7, description: 'Text channel', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};
