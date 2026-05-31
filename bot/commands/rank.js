const db = require("../../database/db");

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

                message.reply(
                    `📊 **YOUR PROFILE**\n\n` +
                    `⭐ Level: ${row.level}\n` +
                    `🔥 XP: ${row.xp}\n` +
                    `💬 Messages: ${row.messages}\n` +
                    `👥 Invites: ${row.invites}`
                );
            }
        );
    }
};