const db = require("../../database/db");

// ================= CODE GENERATOR =================
function generateCode(userId) {
    return "ULTRA-" + userId.slice(-5);
}

// ================= COMMAND =================
module.exports = {
    name: "referral",

    execute(message) {

        const userId = message.author.id;

        db.get(
            "SELECT * FROM referrals WHERE userId = ?",
            [userId],
            (err, row) => {

                if (err) {
                    console.error("Referral DB error:", err.message);
                    return message.reply("❌ Database error. Try again later.");
                }

                // ================= CREATE USER IF NOT EXISTS =================
                if (!row) {

                    const code = generateCode(userId);

                    db.run(
                        `INSERT INTO referrals (userId, code, invites, points)
                         VALUES (?, ?, 0, 0)`,
                        [userId, code],
                        (err) => {
                            if (err) {
                                console.error("Insert error:", err.message);
                                return message.reply("❌ Failed to create referral code.");
                            }

                            return message.reply(`🔗 Your referral code: **${code}**`);
                        }
                    );

                    return;
                }

                // ================= RETURN EXISTING =================
                message.reply(`🔗 Your referral code: **${row.code}**`);
            }
        );
    }
};