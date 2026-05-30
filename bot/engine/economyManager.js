const db = require("../../database/referralDB");

// ================= ADD REFERRAL =================
function addReferral(userId) {
    const code = "ULTRA-" + userId.slice(-5);

    db.run(
        `INSERT OR IGNORE INTO referrals (userId, code, invites, points)
         VALUES (?, ?, 0, 0)`,
        [userId, code]
    );
}

// ================= APPLY REFERRAL =================
function applyReferral(code) {

    if (!code) return;

    db.run(
        `UPDATE referrals
         SET invites = invites + 1,
             points = points + 10
         WHERE code = ?`,
        [code]
    );
}

// ================= GET USER =================
function getReferralUser(userId, callback) {

    db.get(
        `SELECT * FROM referrals WHERE userId = ?`,
        [userId],
        (err, row) => {

            if (err) {
                console.error("Referral DB error:", err.message);
                return callback(null);
            }

            if (row) return callback(row);

            const code = "ULTRA-" + userId.slice(-5);

            db.run(
                `INSERT INTO referrals (userId, code, invites, points)
                 VALUES (?, ?, 0, 0)`,
                [userId, code]
            );

            callback({
                userId,
                code,
                invites: 0,
                points: 0
            });
        }
    );
}

module.exports = {
    addReferral,
    applyReferral,
    getReferralUser
};