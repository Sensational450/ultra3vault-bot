const { getLeaderboard } = require("../engine/referralManager");

module.exports = {
    name: "leaderboard",

    async execute(message) {

        getLeaderboard(10, (rows) => {

            const text = rows.map((u, i) => {
                return `#${i + 1} <@${u.userId}> - ${u.invites} invites (${u.points} pts)`;
            }).join("\n");

            message.channel.send(
                "🏆 **Referral Leaderboard**\n\n" + text
            );
        });
    }
};