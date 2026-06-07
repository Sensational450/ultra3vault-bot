module.exports = {
  data: { name: 'ping', description: '🏓 Check bot latency' },
  async execute(interaction) {
    // Forward to orchestrator (InfoAgent will handle)
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};