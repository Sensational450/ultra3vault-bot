module.exports = {
  data: { name: 'renew', description: '🔄 Renew your subscription' },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};