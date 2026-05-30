const db = require("../../database/db");

// ================= CLAIM DAILY =================
function claimDaily(userId, callback) {

    const now = Date.now();

    db.get(`
        SELECT lastClaim, streak
        FROM users
        WHERE id = ?
    `, [userId], (err, row) => {

        if (err) return callback(false, "DB error");

        const lastClaim = row?.lastClaim || 0;
        let streak = row?.streak || 0;

        const ONE_DAY = 24 * 60 * 60 * 1000;

        if (now - lastClaim < ONE_DAY) {
            return callback(false, "Already claimed today");
        }

        if (now - lastClaim < ONE_DAY * 2) {
            streak += 1;
        } else {
            streak = 1;
        }

        const reward = 10 * streak;

        db.run(`
            UPDATE users
            SET lastClaim = ?, streak = ?, points = COALESCE(points,0) + ?
            WHERE id = ?
        `, [now, streak, reward, userId]);

        callback(true, {
            reward,
            streak
        });
    });
}

module.exports = {
    claimDaily
};