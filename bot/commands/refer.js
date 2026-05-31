const db = require("../../database/db");

module.exports = {
    name: "refer",

    async execute(message, args) {

        const code = args[0];

        if (!code) {
            return message.reply("❌ Usage: !refer CODE");
        }

        const userId = message.author.id;

        // Find referral owner
        db.get(
            `SELECT * FROM referrals WHERE code = ?`,
            [code],
            (err, row) => {

                if (err) {
                    console.log("REFERRAL ERROR:", err.message);
                    return message.reply("❌ Database error");
                }

                if (!row) {
                    return message.reply("❌ Invalid referral code");
                }

                if (row.userId === userId) {
                    return message.reply("❌ You cannot use your own code");
                }

                // Increase invites + points
                db.run(
                    `UPDATE referrals 
                     SET invites = invites + 1,
                         points = points + 10
                     WHERE code = ?`,
                    [code]
                );

                message.reply("✅ Referral applied successfully!");
            }
        );
    }
};