const db = require("../../database/db");

module.exports = {
    name: "achievements",

    async execute(message) {

        db.get(
            "SELECT xp, messages, invites FROM users WHERE id = ?",
            [message.author.id],
            (err, row) => {

                if (err || !row) {
                    return message.reply("❌ No achievements found yet.");
                }

                let badges = [];

                if (row.messages >= 100) badges.push("💬 Chatty User");
                if (row.messages >= 500) badges.push("🔥 Active Member");
                if (row.xp >= 1000) badges.push("⚡ XP Grinder");
                if (row.invites >= 5) badges.push("👥 Community Builder");

                if (badges.length === 0) {
                    badges.push("🌱 Beginner");
                }

                message.reply(
                    `🏆 **YOUR ACHIEVEMENTS**\n\n` +
                    badges.map(b => `• ${b}`).join("\n")
                );
            }
        );
    }
};