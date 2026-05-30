const db = require("../../database/rewards.sqlite");

const DAY = 24 * 60 * 60 * 1000;

// ================= CLAIM DAILY =================
function claimDaily(userId, callback) {

    const now = Date.now();

    db.get(
        "SELECT * FROM users WHERE userId = ?",
        [userId],
        (err, user) => {

            if (!user) {
                db.run(`
                    INSERT INTO users (userId, streak, lastClaim, points)
                    VALUES (?, 1, ?, 10)
                `, [userId, now]);

                return callback({
                    streak: 1,
                    points: 10,
                    message: "First claim! 🔥"
                });
            }

            let streak = user.streak || 0;

            const diff = now - (user.lastClaim || 0);

            // reset streak if missed 24h
            if (diff > DAY * 2) {
                streak = 0;
            }

            streak += 1;

            const reward = 10 + streak * 2;

            db.run(`
                UPDATE users
                SET streak = ?,
                    lastClaim = ?,
                    points = points + ?
                WHERE userId = ?
            `, [streak, now, reward, userId]);

            callback({
                streak,
                points: reward,
                message: "Daily reward claimed 🎁"
            });
        }
    );
}

// ================= GET USER =================
function getUser(userId, callback) {

    db.get(
        "SELECT * FROM users WHERE userId = ?",
        [userId],
        (err, row) => callback(row || null)
    );
}

module.exports = {
    claimDaily,
    getUser
};