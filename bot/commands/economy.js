const { getReferralUser } = require("../engine/referralManager");

module.exports = {
    name: "economy",

    async execute(message) {

        getReferralUser(message.author.id, (data) => {

            message.reply(
                `💰 Economy Profile\n\n` +
                `🎯 Code: ${data.code}\n` +
                `👥 Invites: ${data.invites}\n` +
                `⭐ Points: ${data.points}`
            );
        });
    }
};