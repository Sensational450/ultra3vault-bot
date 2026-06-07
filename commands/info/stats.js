const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: { name: 'stats', description: '📊 Show bot statistics' },
  async execute(interaction) {
    await interaction.deferReply();
    const totalGuilds = interaction.client.guilds.cache.size;
    const totalUsers = interaction.client.users.cache.size;
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .addFields(
        { name: '🌍 Servers', value: `${totalGuilds}`, inline: true },
        { name: '👥 Users', value: `${totalUsers}`, inline: true },
        { name: '⏱️ Uptime', value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`, inline: true },
        { name: '💾 Memory (RSS)', value: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: '📦 Heap Used', value: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: '🟢 Node.js', value: process.version, inline: true }
      )
      .setTimestamp()
      .setColor(0x3498db);
    await interaction.editReply({ embeds: [embed] });
  },
};