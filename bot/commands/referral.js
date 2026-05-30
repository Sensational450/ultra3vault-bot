const { getReferral } = require("../engine/referralManager");

module.exports = {
    name: "referral",

    async execute(message) {

        getReferral(message.author.id, (data) => {

            message.reply(
                `👥 Your Referral Code:\n` +
                `\`${data.code}\`\n\n` +
                `📊 Invites: ${data.invites}\n` +
                `⭐ Points: ${data.points}`
            );
        });
    }
};