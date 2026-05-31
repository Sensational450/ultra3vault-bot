const { claimDaily } = require("../engine/economyManager");

module.exports = {
    name: "daily",

    async execute(message, args, client) {

        const userId = message.author.id;

        claimDaily(userId, (data) => {

            // XP integration (if you added client.xp system)
            if (client?.addXP) {
                client.addXP(userId, 5);
            }

            const streakBonus =
                data.streak >= 7 ? "🔥 STREAK BOOST ACTIVE"
                : data.streak >= 3 ? "⚡ Building momentum"
                : "📊 Start your streak";

            message.reply(
`🎁 ULTRA3 DAILY REWARD

💰 Reward: +${data.reward} points
🔥 Streak: ${data.streak} days
⭐ Total Balance: ${data.points}

━━━━━━━━━━━━━━━━━━
${streakBonus}

🧠 Keep claiming daily to grow your trader rank
`
            );
        });
    }
};