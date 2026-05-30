const { setUserTier } = require("../engine/subscriptionManager");

module.exports = {
    name: "grantvip",

    async execute(message, args) {

        if (!message.member.permissions.has("Administrator")) {
            return message.reply("❌ No permission");
        }

        const user = message.mentions.users.first();
        const tier = args[1];
        const days = parseInt(args[2] || "30");

        if (!user || !tier) {
            return message.reply("Usage: !grantvip @user VIP 30");
        }

        setUserTier(user.id, tier, days);

        message.reply(`✅ Granted ${tier} to ${user.tag} for ${days} days`);
    }
};