const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: { name: 'ping', description: '🏓 Check bot latency' },
  async execute(interaction) {
    // 1️⃣ Defer immediately to avoid timeout
    await interaction.deferReply();

    // 2️⃣ Calculate latency
    const latency = interaction.client.ws.ping;

    // 3️⃣ Build and send embed
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`WebSocket latency: **${latency}ms**`)
      .setColor(0x00ae86);
    await interaction.editReply({ embeds: [embed] });
  },
};