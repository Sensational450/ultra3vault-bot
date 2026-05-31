const db = require("../../database/db");

// ================= CHECK DAILY STREAK =================
function claimDaily(userId, callback) {

    db.get(
        "SELECT streak, lastDaily FROM users WHERE id = ?",
        [userId],
        (err, row) => {

            if (err) return callback(null);

            const now = new Date().toDateString();

            let streak = row?.streak || 0;
            let lastDaily = row?.lastDaily;

            // ================= FIRST TIME =================
            if (!lastDaily) {
                streak = 1;
            }

            // ================= CONTINUOUS STREAK =================
            else if (lastDaily !== now) {

                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                if (row.lastDaily === yesterday.toDateString()) {
                    streak += 1;
                } else {
                    streak = 1; // reset
                }
            } else {
                return callback({
                    error: "ALREADY_CLAIMED"
                });
            }

            const reward = 50 + (streak * 10);

            db.run(
                "UPDATE users SET streak = ?, lastDaily = ?, xp = xp + ?, messages = messages + 1 WHERE id = ?",
                [streak, now, reward, userId]
            );

            callback({
                streak,
                reward
            });
        }
    );
}

module.exports = {
    claimDaily
};