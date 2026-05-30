const { applyReferral } = require("../engine/referralManager");

module.exports = {
    name: "refer",

    async execute(message, args) {

        const code = args[0];
        if (!code) {
            return message.reply("❌ Usage: !refer CODE");
        }

        applyReferral(code, message.author.id);

        message.reply("✅ Referral applied successfully!");
    }
};