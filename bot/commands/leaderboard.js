const { getLeaderboard } = require("../engine/economyManager");

module.exports = {
    name: "leaderboard",

    execute(message) {

        getLeaderboard((rows) => {

            let text = "🏆 **TOP USERS**\n\n";

            rows.forEach((u, i) => {
                text += `${i + 1}. <@${u.userId}> — ${u.points} pts 🔥\n`;
            });

            message.reply(text);
        });
    }
};