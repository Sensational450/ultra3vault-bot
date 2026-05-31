const db = require("../../database/db");

module.exports = {
    name: "leaderboard",

    async execute(message) {

        db.all(
            "SELECT id, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10",
            [],
            (err, rows) => {

                if (err) {
                    return message.reply("❌ DB error");
                }

                if (!rows || rows.length === 0) {
                    return message.reply("📊 No data yet.");
                }

                let text = "🏆 **GLOBAL LEADERBOARD**\n\n";

                rows.forEach((user, index) => {

                    text +=
                        `#${index + 1} <@${user.id}>` +
                        ` • Level ${user.level}` +
                        ` • XP ${user.xp}\n`;
                });

                message.reply(text);
            }
        );
    }
};