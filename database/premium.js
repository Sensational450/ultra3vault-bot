// ================= PREMIUM SYSTEM (PHASE 4 FIXED) =================
// ⚠️ This module NO LONGER uses a separate database file.
// Premium data is stored inside main.sqlite (users table)

const db = require("./db"); // main database

// ================= GIVE PREMIUM =================
function givePremium(userId, durationDays = 7) {

    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;

    db.run(
        `INSERT INTO users (userId, points, streak, lastClaim)
         VALUES (?, 0, 0, 0)
         ON CONFLICT(userId) DO UPDATE SET
         lastClaim = lastClaim`,
        [userId]
    );

    db.run(
        `UPDATE users SET tier = 'VIP', expiresAt = ? WHERE userId = ?`,
        [expiresAt, userId]
    );
}

// ================= CHECK PREMIUM =================
function getPremium(userId, callback) {

    db.get(
        `SELECT * FROM users WHERE userId = ?`,
        [userId],
        (err, row) => {

            if (err) return callback(null);

            if (!row) {
                return callback({
                    userId,
                    tier: "FREE",
                    expiresAt: 0
                });
            }

            const isActive = row.expiresAt && row.expiresAt > Date.now();

            callback({
                ...row,
                tier: isActive ? "VIP" : "FREE",
                active: isActive
            });
        }
    );
}

// ================= REMOVE PREMIUM =================
function revokePremium(userId) {
    db.run(
        `UPDATE users SET tier = 'FREE', expiresAt = 0 WHERE userId = ?`,
        [userId]
    );
}

module.exports = {
    givePremium,
    getPremium,
    revokePremium
};