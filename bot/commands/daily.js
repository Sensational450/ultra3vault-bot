const { claimDaily } = require("../engine/dailyRewards");

module.exports = {
    name: "daily",

    async execute(message) {

        claimDaily(message.author.id, (success, data) => {

            if (!success) {
                return message.reply(`❌ ${data}`);
            }

            message.reply(
                `🎁 Daily Reward Claimed!\n` +
                `💰 +${data.reward} points\n` +
                `🔥 Streak: ${data.streak} days`
            );
        });
    }
};