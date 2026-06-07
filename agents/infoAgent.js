/**
 * ℹ️ InfoAgent v5.0
 * - Handles basic info commands: ping, stats
 */
const BaseAgent = require('./baseAgent');
const { EmbedBuilder } = require('discord.js');

class InfoAgent extends BaseAgent {
  constructor(eventBus, deps) {
    super(eventBus, deps);
  }

  async init() {
    await super.init();
    this.logger.info('ℹ️ InfoAgent ready');
  }

  setupListeners() {
    this.subscribe('command.ping', async ({ interaction }) => {
      await this.handlePing(interaction);
    });
    this.subscribe('command.stats', async ({ interaction }) => {
      await this.handleStats(interaction);
    });
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

  async onInteraction(interaction) {
    // Not needed – all handled via events
  }
}

module.exports = InfoAgent;