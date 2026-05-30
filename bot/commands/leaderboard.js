const { getLeaderboard } = require("../engine/leaderboardEngine");

module.exports = {
    name: "leaderboard",

    async execute(message) {

        getLeaderboard(10, (err, rows) => {

            if (err) {
                return message.reply("❌ Error loading leaderboard");
            }

            let text = "🏆 **TOP USERS LEADERBOARD**\n\n";

            rows.forEach((u, i) => {
                text += `#${i + 1} <@${u.id}> — ${u.points || 0} pts\n`;
            });

            message.channel.send(text);
        });
    }
};