module.exports = {
  data: {
    name: 'welcome-test',
    description: 'Send a test welcome message (Admin only)',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};