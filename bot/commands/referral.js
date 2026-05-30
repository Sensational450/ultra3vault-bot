const db = require("../../database/economy.sqlite");

function generateCode(userId) {
    return "ULTRA-" + userId.slice(-5);
}

module.exports = {
    name: "referral",

    execute(message) {

        const userId = message.author.id;

        db.get(
            "SELECT * FROM referrals WHERE userId = ?",
            [userId],
            (err, row) => {

                if (!row) {

                    const code = generateCode(userId);

                    db.run(
                        "INSERT INTO referrals (userId, code) VALUES (?, ?)",
                        [userId, code]
                    );

                    return message.reply(`🔗 Your referral code: **${code}**`);
                }

                message.reply(`🔗 Your referral code: **${row.code}**`);
            }
        );
    }
};