const db = require("../../database/db");

// ================= VIP GETTER =================
function getVIP(userId, callback) {

    db.get(
        "SELECT * FROM vip_users WHERE userId = ?",
        [userId],
        (err, row) => {

            if (err || !row) {
                return callback({
                    tier: "FREE",
                    multiplier: 1.0,
                    active: false,
                    expiresAt: null
                });
            }

            const now = Date.now();

            // expired VIP cleanup
            if (row.expiresAt && row.expiresAt < now) {
                db.run("DELETE FROM vip_users WHERE userId = ?", [userId]);

                return callback({
                    tier: "FREE",
                    multiplier: 1.0,
                    active: false,
                    expiresAt: null
                });
            }

            callback({
                tier: row.tier,
                multiplier: row.multiplier,
                active: true,
                expiresAt: row.expiresAt
            });
        }
    );
}

// ================= VIP GRANT =================
function grantVIP(userId, tier = "VIP", days = 30, multiplier = 2.0) {

    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

    db.run(
        `INSERT OR REPLACE INTO vip_users (userId, tier, multiplier, expiresAt)
         VALUES (?, ?, ?, ?)`,
        [userId, tier, multiplier, expiresAt]
    );
}

// ================= VIP REMOVE =================
function removeVIP(userId) {
    db.run("DELETE FROM vip_users WHERE userId = ?", [userId]);
}

// ================= CHECK VIP BOOLEAN =================
function isVIP(userId, callback) {

    getVIP(userId, (vip) => {
        callback(vip.active);
    });
}

module.exports = {
    getVIP,
    grantVIP,
    removeVIP,
    isVIP
};