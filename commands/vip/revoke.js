module.exports = {
  data: {
    name: 'revoke',
    description: '🔨 Revoke a user\'s VIP (admin only)',
    options: [{ name: 'user', type: 6, description: 'User to revoke', required: true }],
  },
  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
    }
    const target = interaction.options.getUser('user');
    // Add your logic to remove subscription and role
    await interaction.reply({ content: `✅ Revoked VIP from ${target.tag}`, ephemeral: true });
  },
};