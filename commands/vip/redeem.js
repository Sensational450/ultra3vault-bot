module.exports = {
  data: {
    name: 'redeem',
    description: '🎟️ Redeem a referral or VIP code',
    options: [{ name: 'code', type: 3, description: 'Your code', required: true }],
  },
  async execute(interaction) {
    const code = interaction.options.getString('code');
    // For now, just acknowledge (you can later implement reward logic)
    await interaction.reply({ content: `✅ Code "${code}" redeemed! (Rewards coming soon)`, ephemeral: true });
  },
};