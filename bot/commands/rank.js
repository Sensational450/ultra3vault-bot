const db = require("../../database/db");
const { xpForLevel } = require("../engine/levelingEngine");

function progressBar(current, max) {

    const percent = Math.floor((current / max) * 10);

    return "█".repeat(percent) + "░".repeat(10 - percent);
}

module.exports = {
    name: "rank",

    async execute(message) {

        db.get(
            "SELECT xp, level, messages, invites FROM users WHERE id = ?",
            [message.author.id],
            (err, row) => {

                if (err) {
                    return message.reply("❌ DB error");
                }

                if (!row) {
                    return message.reply("📊 No data found. Start chatting first.");
                }

                const requiredXP = xpForLevel(row.level);
                const bar = progressBar(row.xp, requiredXP);

                message.reply(
                    `📊 **YOUR PROFILE**\n\n` +
                    `⭐ Level: ${row.level}\n` +
                    `🔥 XP: ${row.xp} / ${requiredXP}\n` +
                    `📈 Progress: ${bar}\n\n` +
                    `💬 Messages: ${row.messages}\n` +
                    `👥 Invites: ${row.invites}`
                );
            }
        );
    }
};