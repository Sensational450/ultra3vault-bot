const db = require("../../database/db");

// ================= VIP TIERS =================
const VIP_TIERS = {
    FREE: { multiplier: 1 },
    BRONZE: { multiplier: 1.5 },
    SILVER: { multiplier: 2 },
    GOLD: { multiplier: 3 },
    DIAMOND: { multiplier: 5 }
};

// ================= GET VIP DATA =================
function getVIP(userId, callback) {

    db.get(
        "SELECT vipTier, vipExpires FROM users WHERE id = ?",
        [userId],
        (err, row) => {

            if (err || !row) {
                return callback(VIP_TIERS.FREE);
            }

            const now = Date.now();

            // expired VIP reset
            if (row.vipExpires && row.vipExpires < now) {

                db.run(
                    "UPDATE users SET vipTier = 'FREE', vipExpires = 0 WHERE id = ?",
                    [userId]
                );

                return callback(VIP_TIERS.FREE);
            }

            const tier = row.vipTier || "FREE";

            callback(VIP_TIERS[tier] || VIP_TIERS.FREE);
        }
    );
}

// ================= SET VIP =================
function setVIP(userId, tier, days = 30) {

    const expires = Date.now() + days * 24 * 60 * 60 * 1000;

    db.run(
        "UPDATE users SET vipTier = ?, vipExpires = ? WHERE id = ?",
        [tier, expires, userId]
    );
}

module.exports = {
    getVIP,
    setVIP,
    VIP_TIERS
};