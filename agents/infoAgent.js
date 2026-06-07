/**
 * ℹ️ InfoAgent v5.0
 * - Handles basic info commands directly: ping, stats
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class InfoAgent extends BaseAgent {
  async init() {
    await super.init();
    this.logger.info('ℹ️ InfoAgent ready');
  }

  // Direct handling of slash commands (no event emission needed)
  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    switch (commandName) {
      case 'ping':
        await this.handlePing(interaction);
        break;
      case 'stats':
        await this.handleStats(interaction);
        break;
    }
  }

  async handlePing(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const latency = interaction.client.ws.ping;
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`WebSocket latency: **${latency}ms**`)
      .setColor(0x00ae86);
    await interaction.editReply({ embeds: [embed] });
  }

  async handleStats(interaction) {
    await interaction.deferReply({ ephemeral: false });
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
  }
}

module.exports = InfoAgent;