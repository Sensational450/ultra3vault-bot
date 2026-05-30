const { claimDaily } = require("../engine/streakManager");

module.exports = {
    name: "daily",

    execute(message) {

        claimDaily(message.author.id, (data) => {

            message.reply(
                `🔥 Streak: ${data.streak}\n💰 Reward: ${data.points}\n${data.message}`
            );
        });
    }
};