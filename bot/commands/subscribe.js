const { setVIP } = require("../engine/vipEngine");

module.exports = {
    name: "subscribe",

    async execute(message, args) {

        const tier = (args[0] || "").toUpperCase();

        const valid = ["BRONZE", "SILVER", "GOLD", "DIAMOND"];

        if (!valid.includes(tier)) {
            return message.reply(
                "❌ Use: !subscribe BRONZE | SILVER | GOLD | DIAMOND"
            );
        }

        setVIP(message.author.id, tier, 30);

        message.reply(
            `💎 VIP Activated!\n\n` +
            `Tier: ${tier}\n` +
            `Duration: 30 days\n` +
            `⚡ XP Boost Enabled`
        );
    }
};