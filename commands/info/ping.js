const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: { name: 'ping', description: '🏓 Check bot latency' },
  async execute(interaction) {
    await interaction.deferReply(); // 👈 must defer first
    const latency = interaction.client.ws.ping;
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`WebSocket latency: **${latency}ms**`)
      .setColor(0x00ae86);
    await interaction.editReply({ embeds: [embed] });
  },
};