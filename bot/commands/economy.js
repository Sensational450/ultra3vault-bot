const db = require("../../database/db");

module.exports = {
    name: "economy",

    async execute(message) {

        const userId = message.author.id;

        db.get(
            `SELECT * FROM referrals WHERE userId = ?`,
            [userId],
            (err, row) => {

                if (err) {
                    console.log("ECONOMY ERROR:", err.message);
                    return message.reply("❌ Database error");
                }

                if (!row) {
                    return message.reply(
                        "💰 Economy Profile\n\n" +
                        "🎯 No referral data found yet\n" +
                        "👥 Invites: 0\n" +
                        "⭐ Points: 0"
                    );
                }

                message.reply(
                    `💰 Economy Profile\n\n` +
                    `🎯 Code: ${row.code}\n` +
                    `👥 Invites: ${row.invites}\n` +
                    `⭐ Points: ${row.points}`
                );
            }
        );
    }
};