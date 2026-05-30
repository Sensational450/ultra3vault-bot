const { getUserTier } = require("../engine/subscriptionManager");

module.exports = {
    name: "me",

    async execute(message) {

        const tier = await getUserTier(
            message.author.id
        );

        message.reply(
            `💎 Your tier: ${tier}`
        );
    }
};