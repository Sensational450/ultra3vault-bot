const db = require("../../database/rewardsDB");

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

// ================= DAILY CLAIM =================
function claimDaily(userId, callback) {

    const now = Date.now();

    db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, row) => {

        if (!row) {
            db.run(
                `INSERT INTO users (userId, points, streak, lastClaim)
                 VALUES (?, 10, 1, ?)`,
                [userId, now]
            );

            return callback({
                reward: 10,
                streak: 1,
                points: 10
            });
        }

        const diff = now - row.lastClaim;
        const oneDay = 86400000;

        if (diff < oneDay) {
            return callback({
                reward: 0,
                streak: row.streak,
                points: row.points
            });
        }

        const streak = row.streak + 1;
        const reward = 10 + streak * 2;
        const points = row.points + reward;

        db.run(
            `UPDATE users SET points = ?, streak = ?, lastClaim = ?
             WHERE userId = ?`,
            [points, streak, now, userId]
        );

        callback({ reward, streak, points });
    });
}

module.exports = {
    addReferral,
    applyReferral,
    claimDaily
};