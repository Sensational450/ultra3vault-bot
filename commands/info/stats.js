/**
 * 📊 Stats Command v5.0
 * - Display bot statistics (servers, uptime, memory, etc.)
 * - Emits 'command.stats' event for infoAgent or orchestrator
 */
const { EmbedBuilder, version: discordVersion } = require('discord.js');

module.exports = {
  data: {
    name: 'stats',
    description: '📊 Display bot statistics',
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger, client } = deps;
    await interaction.deferReply({ ephemeral: false });

    if (eventBus) {
      // Let an agent handle the stats (more flexible)
      eventBus.emit('command.stats', { interaction });
      logger?.debug(`📡 Stats command emitted for user ${interaction.user.id}`);
    } else {
      // Fallback: self-handle if no eventBus
      const stats = await getBasicStats(client);
      const embed = buildStatsEmbed(stats);
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

// 📦 Helper functions for fallback (optional)
async function getBasicStats(client) {
  const totalGuilds = client.guilds.cache.size;
  const totalUsers = client.users.cache.size;
  const uptime = formatUptime(client.uptime);
  const memory = process.memoryUsage();
  const nodeVersion = process.version;
  return {
    totalGuilds,
    totalUsers,
    uptime,
    memoryRSS: (memory.rss / 1024 / 1024).toFixed(2),
    memoryHeapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2),
    nodeVersion,
    discordVersion,
  };
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

function buildStatsEmbed(stats) {
  return new EmbedBuilder()
    .setTitle('📊 Bot Statistics')
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .addFields(
      { name: '🌍 Servers', value: `${stats.totalGuilds}`, inline: true },
      { name: '👥 Users', value: `${stats.totalUsers}`, inline: true },
      { name: '⏱️ Uptime', value: stats.uptime, inline: true },
      { name: '💾 Memory (RSS)', value: `${stats.memoryRSS} MB`, inline: true },
      { name: '📦 Heap Used', value: `${stats.memoryHeapUsed} MB`, inline: true },
      { name: '🟢 Node.js', value: stats.nodeVersion, inline: true },
      { name: '🤖 Discord.js', value: `v${discordVersion}`, inline: true }
    )
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp()
    .setColor(0x3498db);
}