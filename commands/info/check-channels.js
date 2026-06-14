const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: {
    name: 'check-channels',
    description: '✅ Verify all bot‑configured channels are accessible',
  },
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const db = interaction.client.db; // assuming db is attached to client (or use orchestrator)

    // 1️⃣ Get news subscriptions
    const newsSubs = await db.all(`SELECT category, channelId FROM news_subscriptions WHERE guildId = ?`, [guild.id]);
    const newsEntries = [];
    for (const sub of newsSubs) {
      const channel = guild.channels.cache.get(sub.channelId);
      const ok = channel && channel.isTextBased() && channel.permissionsFor(guild.members.me).has('SendMessages');
      newsEntries.push(`• ${sub.category} → ${channel ? channel.toString() : '❌ deleted'} ${ok ? '✅' : '❌ no permission'}`);
    }
    if (newsEntries.length === 0) newsEntries.push('No news subscriptions found.');

    // 2️⃣ Get price alert channel (from guild_configs)
    const priceRow = await db.get(`SELECT config FROM guild_configs WHERE guildId = ? AND configKey = 'pricefeed'`, [guild.id]);
    let priceChannelId = null;
    if (priceRow) {
      const config = JSON.parse(priceRow.config);
      priceChannelId = config.priceAlertChannelId;
    }
    let priceStatus = '❌ Not configured';
    if (priceChannelId) {
      const channel = guild.channels.cache.get(priceChannelId);
      const ok = channel && channel.isTextBased() && channel.permissionsFor(guild.members.me).has('SendMessages');
      priceStatus = channel ? `${channel.toString()} ${ok ? '✅' : '❌ no permission'}` : '❌ Channel not found';
    }

    // 3️⃣ Get mod log channel
    const modRow = await db.get(`SELECT config FROM guild_configs WHERE guildId = ? AND configKey = 'moderation'`, [guild.id]);
    let modChannelId = null;
    if (modRow) {
      const config = JSON.parse(modRow.config);
      modChannelId = config.modLogChannel;
    }
    let modStatus = '❌ Not configured';
    if (modChannelId) {
      const channel = guild.channels.cache.get(modChannelId);
      const ok = channel && channel.isTextBased() && channel.permissionsFor(guild.members.me).has('SendMessages');
      modStatus = channel ? `${channel.toString()} ${ok ? '✅' : '❌ no permission'}` : '❌ Channel not found';
    }

    // 4️⃣ Get whale alert channel (from pricefeed config)
    let whaleChannelId = null;
    if (priceRow) {
      const config = JSON.parse(priceRow.config);
      whaleChannelId = config.whaleAlertChannelId;
    }
    let whaleStatus = '❌ Not configured';
    if (whaleChannelId) {
      const channel = guild.channels.cache.get(whaleChannelId);
      const ok = channel && channel.isTextBased() && channel.permissionsFor(guild.members.me).has('SendMessages');
      whaleStatus = channel ? `${channel.toString()} ${ok ? '✅' : '❌ no permission'}` : '❌ Channel not found';
    }

    // 5️⃣ Build embed
    const embed = new EmbedBuilder()
      .setTitle('🔍 Bot Channel Status')
      .setColor(0x00ae86)
      .setTimestamp()
      .addFields(
        { name: '📰 News Subscriptions', value: newsEntries.slice(0, 10).join('\n') || 'None', inline: false },
        { name: '📊 Price Alert Channel', value: priceStatus, inline: true },
        { name: '🛡️ Mod Log Channel', value: modStatus, inline: true },
        { name: '🐋 Whale Alert Channel', value: whaleStatus, inline: true }
      )
      .setFooter({ text: 'Run /setpricechannel, /setmodlog, /newssubscribe to configure' });

    await interaction.editReply({ embeds: [embed] });
  },
};