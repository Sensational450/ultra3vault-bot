const db = require("../../database/db");

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

                if (err) return console.error(err);

                if (!row) {
                    const code = generateCode(userId);

                    db.run(
                        "INSERT INTO referrals (userId, code, invites, points) VALUES (?, ?, 0, 0)",
                        [userId, code]
                    );

                    return message.reply(`🔗 Your referral code: **${code}**`);
                }

                message.reply(`🔗 Your referral code: **${row.code}**`);
            }
        );
    }
};