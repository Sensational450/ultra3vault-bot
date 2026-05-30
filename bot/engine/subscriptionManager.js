const db = require("../../database/db");
const membershipTiers = require("./membershipTiers");

// ================= GET USER TIER =================
async function getUserTier(userId) {

    return new Promise((resolve) => {

        db.get(
            "SELECT tier, expiresAt FROM users WHERE id = ?",
            [userId],
            (err, row) => {

                if (err || !row) {
                    return resolve("FREE");
                }

                // Auto-expire
                if (
                    row.expiresAt &&
                    Date.now() > row.expiresAt
                ) {

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
async function setUserTier(
    userId,
    tier = "FREE",
    days = 30
) {

    const expiresAt =
        tier === "FREE"
            ? null
            : Date.now() + days * 86400000;

    return new Promise((resolve, reject) => {

        db.run(
            `
            INSERT INTO users (
                id,
                tier,
                expiresAt
            )
            VALUES (?, ?, ?)

            ON CONFLICT(id)
            DO UPDATE SET
                tier = excluded.tier,
                expiresAt = excluded.expiresAt
            `,
            [
                userId,
                tier,
                expiresAt
            ],
            (err) => {

                if (err) return reject(err);

                resolve(true);
            }
        );

    });

}

// ================= GET SUB INFO =================
async function getUserSubscription(userId) {

    return new Promise((resolve) => {

        db.get(
            `
            SELECT *
            FROM users
            WHERE id = ?
            `,
            [userId],
            (err, row) => {

                if (err || !row) {
                    return resolve({
                        tier: "FREE"
                    });
                }

                resolve(row);
            }
        );

    });

}

// ================= ACCESS CHECK =================
async function hasAccess(
    userId,
    channelName
) {

    const tier =
        await getUserTier(userId);

    const plan =
        membershipTiers[tier] ||
        membershipTiers.FREE;

    return (
        plan.access || []
    ).includes(channelName);

}

// ================= CLEANUP =================
async function cleanupExpired() {

    return new Promise((resolve) => {

        db.all(
            `
            SELECT id,
                   tier,
                   expiresAt
            FROM users
            `,
            async (err, rows) => {

                if (err) {
                    return resolve();
                }

                const now = Date.now();

                for (const user of rows) {

                    if (
                        user.expiresAt &&
                        now > user.expiresAt
                    ) {

                        db.run(
                            `
                            UPDATE users
                            SET tier = 'FREE',
                                expiresAt = NULL
                            WHERE id = ?
                            `,
                            [user.id]
                        );

                        console.log(
                            `⛔ EXPIRED USER: ${user.id}`
                        );
                    }
                }

                resolve();
            }
        );

    });

}

// ================= PREMIUM CHECK =================
function isPremium(tier) {

    return (
        tier === "VIP" ||
        tier === "VIP_ALPHA"
    );

}

module.exports = {
    getUserTier,
    setUserTier,
    getUserSubscription,
    hasAccess,
    cleanupExpired,
    isPremium
};