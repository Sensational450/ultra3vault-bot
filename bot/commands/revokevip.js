const { setUserTier } = require("../engine/subscriptionManager");

module.exports = {
    name: "revokevip",

    async execute(message) {

        if (!message.member.permissions.has("Administrator")) {
            return message.reply("❌ No permission");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("Mention a user");

        setUserTier(user.id, "FREE");

        message.reply(`⛔ ${user.tag} downgraded to FREE`);
    }
};