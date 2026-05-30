const { upgradeUser } = require("../engine/subscriptionManager");

module.exports = {
    name: "upgrade",

    async execute(message, args) {

        const tier = args[0];

        if (!tier) {
            return message.reply("Usage: !upgrade VIP or VIP_ALPHA");
        }

        const valid = ["VIP", "VIP_ALPHA"];

        if (!valid.includes(tier)) {
            return message.reply("Invalid tier.");
        }

        const success = await upgradeUser(
            message.author.id,
            tier,
            message.member   // 🔥 IMPORTANT: sends Discord member
        );

        if (!success) {
            return message.reply("Upgrade failed.");
        }

        return message.reply(`✅ You are now **${tier}** and role has been assigned.`);
    }
};
