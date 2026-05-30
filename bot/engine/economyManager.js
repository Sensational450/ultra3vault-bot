const db = require("../../database/economy.sqlite");

// ================= GET USER =================
function getUser(userId, callback) {

    db.get(
        "SELECT * FROM users WHERE userId = ?",
        [userId],
        (err, row) => {

            if (!row) {
                db.run(
                    "INSERT INTO users (userId) VALUES (?)",
                    [userId]
                );

                return callback({
                    userId,
                    points: 0,
                    streak: 0,
                    lastClaim: 0,
                    referrals: 0
                });
            }

            callback(row);
        }
    );
}

// ================= DAILY REWARD =================
function claimDaily(userId, callback) {

    getUser(userId, (user) => {

        const now = Date.now();
        const ONE_DAY = 86400000;

        let streak = user.streak;
        let reward = 10;

        // reset streak if missed 24h
        if (now - user.lastClaim > ONE_DAY * 2) {
            streak = 0;
        }

        // increase streak
        streak += 1;

        // streak multiplier
        if (streak >= 7) reward = 50;
        else if (streak >= 3) reward = 25;

        const newPoints = user.points + reward;

        db.run(
            `UPDATE users 
             SET points = ?, streak = ?, lastClaim = ?
             WHERE userId = ?`,
            [newPoints, streak, now, userId]
        );

        callback({
            reward,
            points: newPoints,
            streak
        });
    });
}

// ================= ADD REFERRAL =================
function addReferral(userId) {

    db.run(
        `UPDATE users 
         SET referrals = referrals + 1,
             points = points + 20
         WHERE userId = ?`,
        [userId]
    );
}

// ================= LEADERBOARD =================
function getLeaderboard(callback) {

    db.all(
        `SELECT userId, points, streak 
         FROM users 
         ORDER BY points DESC 
         LIMIT 10`,
        [],
        callback
    );
}

module.exports = {
    getUser,
    claimDaily,
    addReferral,
    getLeaderboard
};