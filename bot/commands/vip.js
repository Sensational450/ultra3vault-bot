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

                const now = Date.now();

                const remaining =
                    row.vipExpires > now
                        ? Math.ceil((row.vipExpires - now) / 86400000)
                        : 0;

                const isActive = row.vipExpires > now;

                message.reply(
`💎 **VIP STATUS**

👑 Tier: ${row.vipTier || "FREE"}
📅 Status: ${isActive ? "ACTIVE" : "INACTIVE"}
⏳ Days Left: ${remaining}

⚡ VIP Benefits:
• XP Boost Multiplier
• Faster Level Progression
• Leaderboard Advantage

🛒 Use !shop to upgrade`
                );
            }
        );
    }
};