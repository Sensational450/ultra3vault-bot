const { claimDaily } = require("../engine/streakEngine");

module.exports = {
    name: "daily",

    async execute(message) {

        claimDaily(message.author.id, (data) => {

            if (data?.error === "ALREADY_CLAIMED") {
                return message.reply("⏳ You already claimed today.");
            }

            message.reply(
                `🎁 Daily Reward Claimed!\n\n` +
                `🔥 Streak: ${data.streak} days\n` +
                `💰 Reward: +${data.reward} XP`
            );
        });
    }
};