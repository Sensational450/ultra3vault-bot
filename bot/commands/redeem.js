const { redeemCode } = require("../engine/redeemEngine");

module.exports = {
name: "redeem",

async execute(message, args) {

    const code = args[0];

    if (!code) {
        return message.reply(
            "🎁 Usage: `!redeem CODE`"
        );
    }

    redeemCode(
        message.author.id,
        code,
        (result) => {

            if (!result.success) {
                return message.reply(
                    `❌ ${result.message}`
                );
            }

            message.reply(
                `🎉 Code redeemed successfully!\n\n` +
                `💰 Reward: ${result.reward} points`
            );
        }
    );
}

};