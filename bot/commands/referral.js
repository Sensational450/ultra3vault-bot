const { getReferral } = require("../engine/referralManager");

module.exports = {
    name: "referral",

    execute(message) {

        getReferral(message.author.id, (data) => {

            message.reply(
                `🔗 Your referral code:\n\`${data.code}\`\n\nInvites: ${data.invites}\nPoints: ${data.points}`
            );
        });
    }
};