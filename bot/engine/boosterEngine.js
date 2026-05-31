const db = require("../../database/db");

// ================= GET BOOSTER =================
function getBooster(userId, callback) {

    db.get(
        "SELECT * FROM boosters WHERE userId = ? ORDER BY expiresAt DESC LIMIT 1",
        [userId],
        (err, row) => {

            if (err || !row) {
                return callback({
                    multiplier: 1.0
                });
            }

            const now = Date.now();

            if (row.expiresAt < now) {
                db.run("DELETE FROM boosters WHERE userId = ?", [userId]);

                return callback({
                    multiplier: 1.0
                });
            }

            callback({
                multiplier: row.multiplier
            });
        }
    );
}

// ================= GIVE BOOSTER =================
function giveBooster(userId, multiplier = 2.0, minutes = 60, type = "XP") {

    const expiresAt = Date.now() + minutes * 60 * 1000;

    db.run(
        `INSERT INTO boosters (userId, multiplier, expiresAt, type)
         VALUES (?, ?, ?, ?)`,
        [userId, multiplier, expiresAt, type]
    );
}

// ================= CLEAR BOOSTERS =================
function clearBoosters(userId) {
    db.run("DELETE FROM boosters WHERE userId = ?", [userId]);
}

module.exports = {
    getBooster,
    giveBooster,
    clearBoosters
};