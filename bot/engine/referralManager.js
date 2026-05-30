const db = require("../../database/rewards.sqlite");

function generateCode(userId) {
    return "ULTRA-" + userId.slice(-5);
}

// ================= GET REFERRAL =================
function getReferral(userId, callback) {

    db.get(
        "SELECT * FROM referrals WHERE userId = ?",
        [userId],
        (err, row) => {

            if (row) return callback(row);

            const code = generateCode(userId);

            db.run(
                "INSERT INTO referrals (userId, code, invites, points) VALUES (?, ?, 0, 0)",
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

// ================= ADD REFERRAL =================
function addReferral(code) {

    db.run(`
        UPDATE referrals
        SET invites = invites + 1,
            points = points + 10
        WHERE code = ?
    `, [code]);
}

// ================= REWARD REFERRER =================
function rewardReferral(userId, points = 5) {

    db.run(`
        UPDATE referrals
        SET points = points + ?
        WHERE userId = ?
    `, [points, userId]);
}

module.exports = {
    getReferral,
    addReferral,
    rewardReferral
};