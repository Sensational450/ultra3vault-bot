/**
 * 🏓 Ping Command v5.0
 * - Check bot response latency
 * - Emits 'command.ping' event for infoAgent (or self‑reply)
 */
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'ping',
    description: '🏓 Check bot latency',
  },

  async execute(interaction, deps = {}) {
    const { eventBus, logger, client } = deps;
    await interaction.deferReply({ ephemeral: false });

    // Calculate round-trip latency
    const sent = Date.now();
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 API Latency', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true },
        { name: '⏱️ Round-trip', value: 'Calculating...', inline: true }
      )
      .setColor(0x00ae86);

    await interaction.editReply({ embeds: [embed] });
    const roundtrip = Date.now() - sent;
    embed.spliceFields(1, 1, { name: '⏱️ Round-trip', value: `${roundtrip}ms`, inline: true });
    await interaction.editReply({ embeds: [embed] });

    if (eventBus) {
      eventBus.emit('command.ping', { interaction, latency: roundtrip });
      logger?.debug(`📡 Ping command emitted for user ${interaction.user.id}`);
    }
  },
};
