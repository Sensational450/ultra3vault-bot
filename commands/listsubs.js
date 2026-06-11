module.exports = {
  data: {
    name: 'listsubs',
    description: 'List all news subscriptions in this server',
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};