/**
 * Weekly Leaderboard Job – Webhook Version
 * Posts top 5 coin earners via the "leaderboard" webhook (Architect).
 */
const { sendWebhook } = require('../core/webhook');
const { EmbedBuilder } = require('discord.js');

module.exports = (options) => {
  const { eventBus, logger, models, client } = options;

  return async () => {
    try {
      const leaderboard = await models.Economy.getLeaderboard('global', 5);
      if (!leaderboard.length) {
        logger.debug('No leaderboard data to post');
        return;
      }

      let description = '';
      for (let i = 0; i < leaderboard.length; i++) {
        const user = await client.users.fetch(leaderboard[i].userId).catch(() => null);
        description += `${i+1}. **${user?.username || leaderboard[i].userId}** – ${leaderboard[i].balance} coins\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Weekly Leaderboard')
        .setDescription(description)
        .setColor(0xffd700)
        .setTimestamp()
        .setFooter({ text: 'Ultra3Vault • Weekly Top 5' });

      await sendWebhook('leaderboard', { embeds: [embed] });
      logger.info('📊 Weekly leaderboard posted via Architect webhook');
    } catch (err) {
      logger.error(`Failed to post weekly leaderboard: ${err.message}`);
    }
  };
};