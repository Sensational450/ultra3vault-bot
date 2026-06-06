/**
 * 👋 GuildMemberAdd Event v5.0
 * - Forwards new member events to orchestrator
 * - Agents (moderation, welcome, anti-raid) can react
 * - Optional: log member joins for analytics
 */
module.exports = (client, orchestrator, options = {}) => {
  const { logger } = options;

  client.on('guildMemberAdd', async (member) => {
    // 🚫 Ignore bots if desired (optional)
    if (options.ignoreBots && member.user.bot) return;

    try {
      logger?.debug(`👤 Member joined: ${member.user.tag} in ${member.guild.name}`);
      await orchestrator.onGuildMemberAdd(member);
    } catch (err) {
      logger?.error(`❌ Error in guildMemberAdd handler: ${err.message}`);
    }
  });
};