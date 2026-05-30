const {
    upgradeUser,
    getUserTier
} = require("../engine/subscriptionManager");

module.exports = {
    name: "upgrade",

    async execute(message, args) {

        const userId = message.author.id;
        const currentTier = getUserTier(userId);

        // ================= HELP MENU =================
        if (!args[0]) {
            return message.reply(
                `💎 **VIP Upgrade System**\n\n` +
                `Your current plan: **${currentTier}**\n\n` +
                `Commands:\n` +
                `👉 !upgrade vip\n` +
                `👉 !upgrade alpha`
            );
        }

        const plan = args[0].toLowerCase();

        // ================= VIP =================
        if (plan === "vip") {

            if (currentTier === "VIP" || currentTier === "VIP_ALPHA") {
                return message.reply("⚠️ You already have VIP or higher.");
            }

            upgradeUser(userId, "VIP");

            return message.reply(
                "✅ You are now **VIP**!\n" +
                "Access unlocked: VIP alerts, Airdrops, Breaking news"
            );
        }

        // ================= VIP ALPHA =================
        if (plan === "alpha") {

            if (currentTier === "VIP_ALPHA") {
                return message.reply("⚠️ You already have VIP_ALPHA.");
            }

            upgradeUser(userId, "VIP_ALPHA");

            return message.reply(
                "🔥 You are now **VIP_ALPHA**!\n" +
                "Access unlocked: Whale alerts, Security signals, Alpha engine"
            );
        }

        return message.reply("❌ Invalid plan. Use `vip` or `alpha`.");
    }
};
