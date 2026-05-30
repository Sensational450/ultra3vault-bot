const db = require("../../database/db");
const membershipTiers = require("./membershipTiers");

// ================= GET USER TIER =================
async function getUserTier(userId) {

    return new Promise((resolve) => {

        db.get(
            "SELECT tier, expiresAt FROM users WHERE id = ?",
            [userId],
            (err, row) => {

                if (err || !row)
                    return resolve("FREE");

                if (
                    row.expiresAt &&
                    Date.now() > row.expiresAt
                ) {

                    db.run(
                        "UPDATE users SET tier='FREE', expiresAt=NULL WHERE id=?",
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
function setUserTier(
    userId,
    tier = "FREE",
    days = 30
) {

    const expiresAt =
        tier === "FREE"
            ? null
            : Date.now() + days * 86400000;

    db.run(
        `
        INSERT INTO users
        (id,tier,expiresAt)
        VALUES (?,?,?)
        ON CONFLICT(id)
        DO UPDATE SET
        tier=excluded.tier,
        expiresAt=excluded.expiresAt
        `,
        [userId, tier, expiresAt]
    );
}

// ================= ACCESS =================
async function hasAccess(
    userId,
    channelName
) {

    const tier = await getUserTier(userId);

    const plan =
        membershipTiers[tier] ||
        membershipTiers.FREE;

    return plan.access.includes(channelName);
}

// ================= CLEANUP =================
async function cleanupExpired() {

    db.all(
        `
        SELECT id,tier,expiresAt
        FROM users
        `,
        [],
        (err, rows) => {

            if (err) return;

            rows.forEach(user => {

                if (
                    user.expiresAt &&
                    Date.now() > user.expiresAt
                ) {

                    db.run(
                        `
                        UPDATE users
                        SET tier='FREE',
                        expiresAt=NULL
                        WHERE id=?
                        `,
                        [user.id]
                    );

                    console.log(
                        `⛔ Expired: ${user.id}`
                    );
                }
            });
        }
    );
}

module.exports = {
    getUserTier,
    setUserTier,
    hasAccess,
    cleanupExpired
};