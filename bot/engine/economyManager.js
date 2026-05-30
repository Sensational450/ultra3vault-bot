const db = require("../../database/rewards.sqlite");

// ================= ADD POINTS =================
function addPoints(userId, amount) {

    db.run(`
        UPDATE users
        SET points = points + ?
        WHERE userId = ?
    `, [amount, userId]);
}

// ================= GET BALANCE =================
function getPoints(userId, callback) {

    db.get(
        "SELECT points FROM users WHERE userId = ?",
        [userId],
        (err, row) => callback(row?.points || 0)
    );
}

// ================= SPEND POINTS =================
function spendPoints(userId, amount, callback) {

    db.get(
        "SELECT points FROM users WHERE userId = ?",
        [userId],
        (err, row) => {

            if (!row || row.points < amount) {
                return callback(false);
            }

            db.run(`
                UPDATE users
                SET points = points - ?
                WHERE userId = ?
            `, [amount, userId]);

            callback(true);
        }
    );
}

module.exports = {
    addPoints,
    getPoints,
    spendPoints
};