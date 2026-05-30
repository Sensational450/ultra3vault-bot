const db = require("../../database/db");
const membershipTiers = require("./membershipTiers");

// ================= GET USER TIER =================
function getUserTier(userId) {

    return new Promise((resolve) => {

        db.get(
            "SELECT tier, expiresAt FROM users WHERE id = ?",
            [userId],
            (err, row) => {

                if (err || !row) return resolve("FREE");

                // expire check
                if (row.expiresAt && Date.now() > row.expiresAt) {

                    db.run(
                        "UPDATE users SET tier = 'FREE', expiresAt = NULL WHERE id = ?",
                        [userId]
                    );

                    return resolve("FREE");
                }

                resolve(row.tier || "FREE");
            }
        );
    });
}

// ================= SET USER TIER =================
function setUserTier(userId, tier, days = 30) {

    const expiresAt =
        tier === "FREE"
            ? null
            : Date.now() + days * 86400000;

    db.run(
        `
        INSERT INTO users (id, tier, expiresAt)
        VALUES (?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET tier = excluded.tier,
        expiresAt = excluded.expiresAt
        `,
        [userId, tier, expiresAt]
    );
}

// ================= ACCESS CHECK (FIXED) =================
function hasAccess(userId, channelName) {

    return new Promise((resolve) => {

        db.get(
            "SELECT tier FROM users WHERE id = ?",
            [userId],
            (err, row) => {

                const tier = row?.tier || "FREE";
                const plan = membershipTiers[tier] || membershipTiers.FREE;

                resolve(plan.access.includes(channelName));
            }
        );
    });
}

// ================= CLEANUP =================
function cleanupExpired() {

    db.all("SELECT id, tier, expiresAt FROM users", (err, rows) => {

        if (err) return;

        for (const user of rows) {

            if (user.expiresAt && Date.now() > user.expiresAt) {

                db.run(
                    "UPDATE users SET tier = 'FREE', expiresAt = NULL WHERE id = ?",
                    [user.id]
                );

                console.log(`⛔ EXPIRED USER: ${user.id}`);
            }
        }
    });
}

module.exports = {
    getUserTier,
    setUserTier,
    hasAccess,
    cleanupExpired
};