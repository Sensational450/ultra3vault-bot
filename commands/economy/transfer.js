module.exports = {
  data: {
    name: 'transfer',
    description: '💸 Transfer coins to another user',
    options: [
      { name: 'user', type: 6, description: 'Recipient', required: true },
      { name: 'amount', type: 4, description: 'Amount', required: true },
    ],
  },
  async execute(interaction) {
    await interaction.client.orchestrator.onInteraction(interaction);
  },
};