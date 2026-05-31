const db = require("../../database/db");

// ================= USER INIT =================
function ensureUser(userId) {
    db.run(`
        INSERT OR IGNORE INTO economy (userId, balance)
        VALUES (?, 0)
    `, [userId]);

    db.run(`
        INSERT OR IGNORE INTO daily_streaks (userId, streak, lastClaim, points)
        VALUES (?, 0, 0, 0)
    `, [userId]);
}

// ================= GET BALANCE =================
function getBalance(userId, cb) {
    db.get(
        "SELECT balance FROM economy WHERE userId = ?",
        [userId],
        (err, row) => {
            cb(row?.balance || 0);
        }
    );
}

// ================= ADD BALANCE =================
function addBalance(userId, amount) {
    ensureUser(userId);

    db.run(
        "UPDATE economy SET balance = balance + ? WHERE userId = ?",
        [amount, userId]
    );
}

// ================= DAILY REWARD =================
function claimDaily(userId, cb) {
    ensureUser(userId);

    db.get(
        "SELECT * FROM daily_streaks WHERE userId = ?",
        [userId],
        (err, row) => {

            const now = Date.now();
            const day = 24 * 60 * 60 * 1000;

            let streak = row?.streak || 0;
            let last = row?.lastClaim || 0;

            if (now - last < day) {
                return cb({
                    ok: false,
                    message: "Already claimed today"
                });
            }

            if (now - last < day * 2) {
                streak += 1;
            } else {
                streak = 1;
            }

            const reward = 10 + streak * 2;

            db.run(
                `UPDATE daily_streaks
                 SET streak = ?, lastClaim = ?, points = points + ?
                 WHERE userId = ?`,
                [streak, now, reward, userId]
            );

            addBalance(userId, reward);

            cb({
                ok: true,
                reward,
                streak,
                points: row?.points + reward
            });
        }
    );
}

// ================= XP SYSTEM =================
function addXP(userId, xp) {
    ensureUser(userId);

    db.run(`
        UPDATE economy
        SET balance = balance + ?
        WHERE userId = ?
    `, [xp, userId]);
}

// ================= LEVEL SYSTEM =================
function getLevel(balance) {
    return Math.floor(Math.sqrt(balance / 10));
}

// ================= EXPORTS =================
module.exports = {
    ensureUser,
    getBalance,
    addBalance,
    claimDaily,
    addXP,
    getLevel
};