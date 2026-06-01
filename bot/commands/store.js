const {
    buyVIP,
    buyBooster,
    getBalance,
    redeemCode
} = require("../engine/monetizationEngine");

module.exports = {
    name: "store",

    async execute(message, args) {

        const sub = args[0];

        if (!sub) {
            return message.reply(
                "🛒 STORE COMMANDS:\n" +
                "!store vip VIP | PRO | ELITE\n" +
                "!store booster SMALL | MEDIUM | ULTRA\n" +
                "!store redeem CODE"
            );
        }

        // ================= BALANCE =================
        if (sub === "balance") {
            return getBalance(message.author.id, (bal) => {
                message.reply(`💰 Your balance: **${bal} points**`);
            });
        }

        // ================= VIP =================
        if (sub === "vip") {
            const tier = args[1];

            return buyVIP(message.author.id, tier, (ok, msg) => {
                message.reply(ok ? `✅ ${msg}` : `❌ ${msg}`);
            });
        }

        // ================= BOOSTER =================
        if (sub === "booster") {
            const type = args[1];

            return buyBooster(message.author.id, type, (ok, msg) => {
                message.reply(ok ? `⚡ ${msg}` : `❌ ${msg}`);
            });
        }

        // ================= REDEEM =================
        if (sub === "redeem") {
            const code = args[1];

            return redeemCode(message.author.id, code, (ok, msg) => {
                message.reply(ok ? `🎁 ${msg}` : `❌ ${msg}`);
            });
        }
    }
};