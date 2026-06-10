module.exports = (options) => {
  const { eventBus, logger, models, client, channelId } = options;
  return async () => {
    const leaderboard = await models.Economy.getLeaderboard('global', 5);
    if (!leaderboard.length) return;
    let description = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const user = await client.users.fetch(leaderboard[i].userId).catch(() => null);
      description += `${i+1}. **${user?.username || leaderboard[i].userId}** – ${leaderboard[i].balance} coins\n`;
    }
    const channel = client.channels.cache.get(channelId);
    if (channel) await channel.send(`**Weekly Leaderboard**\n${description}`);
  };
};