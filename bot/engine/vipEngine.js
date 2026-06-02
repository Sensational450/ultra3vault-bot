const db = require("../../database/db");
const { trackRevenue } = require("../engine/revenueEngine");

// ================= VIP TIERS =================
const VIP_TIERS = {
    VIP: { multiplier: 2.0, days: 30 },
    GOLD: { multiplier: 3.0, days: 30 },
    PLATINUM: { multiplier: 5.0, days: 30 }
};

// ================= GET VIP =================
function getVIP(userId, callback) {

    db.get(
        "SELECT * FROM vip_users WHERE userId = ?",
        [userId],
        (err, row) => {

            if (err || !row) {
                return callback({
                    tier: "FREE",
                    multiplier: 1,
                    active: false,
                    expiresAt: null,
                    daysRemaining: 0
                });
            }

            const now = Date.now();

            if (row.expiresAt && row.expiresAt <= now) {

                db.run(
                    "DELETE FROM vip_users WHERE userId = ?",
                    [userId]
                );

                return callback({
                    tier: "FREE",
                    multiplier: 1,
                    active: false,
                    expiresAt: null,
                    daysRemaining: 0
                });
            }

            const daysRemaining = Math.ceil(
                (row.expiresAt - now) / (1000 * 60 * 60 * 24)
            );

            callback({
                tier: row.tier,
                multiplier: row.multiplier,
                active: true,
                expiresAt: row.expiresAt,
                daysRemaining
            });
        }
    );
}

// ================= GRANT VIP =================
function grantVIP(userId, tier = "VIP", days = null) {

    const preset = VIP_TIERS[tier] || VIP_TIERS.VIP;

    const multiplier = preset.multiplier;
    const duration = days || preset.days;

    const expiresAt = Date.now() + duration * 86400000;

    db.run(
        `INSERT OR REPLACE INTO vip_users (userId, tier, multiplier, expiresAt)
         VALUES (?, ?, ?, ?)`,
        [userId, tier, multiplier, expiresAt]
    );

    // ================= SYSTEM REVENUE TRACK =================
    trackRevenue({
        userId,
        itemType: "VIP",
        itemId: tier,
        amount: 0,
        source: "system"
    });
}

// ================= EXTEND VIP =================
function extendVIP(userId, extraDays = 30) {

    getVIP(userId, (vip) => {

        const base = vip.active ? vip.expiresAt : Date.now();

        const newExpiry = base + extraDays * 86400000;

        db.run(
            `UPDATE vip_users SET expiresAt = ? WHERE userId = ?`,
            [newExpiry, userId]
        );
    });
}

// ================= REMOVE VIP =================
function removeVIP(userId) {
    db.run("DELETE FROM vip_users WHERE userId = ?", [userId]);
}

// ================= CHECK VIP =================
function isVIP(userId, callback) {
    getVIP(userId, (vip) => callback(vip.active));
}

// ================= CLEANUP =================
function cleanupExpiredVIPs() {
    db.run(`DELETE FROM vip_users WHERE expiresAt <= ?`, [Date.now()]);
}

module.exports = {
    VIP_TIERS,
    getVIP,
    grantVIP,
    extendVIP,
    removeVIP,
    isVIP,
    cleanupExpiredVIPs
};