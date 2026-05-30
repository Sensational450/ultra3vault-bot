const { claimDaily } = require("../engine/economyManager");

module.exports = {
    name: "daily",

    async execute(message) {

        claimDaily(message.author.id, (data) => {

            message.reply(
                `🎁 Daily Reward Claimed!\n` +
                `💰 +${data.reward} points\n` +
                `🔥 Streak: ${data.streak} days\n` +
                `⭐ Total: ${data.points}`
            );
        });
    }
};