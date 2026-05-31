const db = require("../../database/db");

module.exports = {
    name: "vip",

    async execute(message) {

        db.get(
            "SELECT vipTier, vipExpires FROM users WHERE id = ?",
            [message.author.id],
            (err, row) => {

                if (err || !row) {
                    return message.reply("❌ No VIP data found");
                }

                const remaining =
                    row.vipExpires > 0
                        ? Math.floor((row.vipExpires - Date.now()) / 86400000)
                        : 0;

                message.reply(
                    `💎 **VIP STATUS**\n\n` +
                    `Tier: ${row.vipTier}\n` +
                    `Expires in: ${remaining} days\n` +
                    `⚡ Active Boost System`
                );
            }
        );
    }
};