const db = require("../../database/daily.sqlite");

module.exports = {
    name: "daily",

    async execute(message) {

        const userId = message.author.id;
        const now = Date.now();

        db.get(
            "SELECT lastClaim FROM daily WHERE userId = ?",
            [userId],
            (err, row) => {

                const cooldown = 24 * 60 * 60 * 1000;

                if (row && now - row.lastClaim < cooldown) {
                    return message.reply("⏳ Already claimed today");
                }

                db.run(
                    `
                    INSERT OR REPLACE INTO daily (userId, lastClaim)
                    VALUES (?, ?)
                    `,
                    [userId, now]
                );

                message.reply("🎁 You claimed your daily reward!");
            }
        );
    }
};