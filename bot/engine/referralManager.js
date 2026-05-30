const db = require("../../database/referrals");

// ================= GENERATE CODE =================
function generateCode(userId) {
    return "ULTRA-" + userId.slice(-6);
}

// ================= GET OR CREATE USER =================
function getReferral(userId, callback) {

    db.get(
        "SELECT * FROM referrals WHERE userId = ?",
        [userId],
        (err, row) => {

            if (row) return callback(row);

            const code = generateCode(userId);

            db.run(
                `INSERT INTO referrals (userId, code, createdAt)
                 VALUES (?, ?, ?)`,
                [userId, code, Date.now()]
            );

            callback({
                userId,
                code,
                invites: 0,
                points: 0,
                referredBy: null
            });
        }
    );
}

// ================= APPLY REFERRAL =================
function applyReferral(code, newUserId) {

    db.get(
        "SELECT userId FROM referrals WHERE code = ?",
        [code],
        (err, row) => {

            if (!row) return;

            const referrerId = row.userId;

            if (referrerId === newUserId) return;

            // update referrer
            db.run(
                `UPDATE referrals
                 SET invites = invites + 1,
                     points = points + 10
                 WHERE userId = ?`,
                [referrerId]
            );

            // set referred user
            db.run(
                `UPDATE referrals
                 SET referredBy = ?
                 WHERE userId = ?`,
                [referrerId, newUserId]
            );

            // log
            db.run(
                `INSERT INTO referral_logs (referrer, referred, code, timestamp)
                 VALUES (?, ?, ?, ?)`,
                [referrerId, newUserId, code, Date.now()]
            );

            console.log(`👥 Referral: ${referrerId} invited ${newUserId}`);
        }
    );
}

// ================= TOP REFERRERS =================
function getLeaderboard(limit = 10, callback) {

    db.all(
        `SELECT * FROM referrals
         ORDER BY invites DESC, points DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

module.exports = {
    getReferral,
    applyReferral,
    getLeaderboard
};