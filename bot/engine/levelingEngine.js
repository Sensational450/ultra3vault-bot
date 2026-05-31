const db = require("../../database/db");

// ================= XP CURVE =================
function xpForLevel(level) {
    return 100 * level * level;
}

// ================= GET OR CREATE USER =================
function getUser(userId, callback) {

    db.get(
        "SELECT * FROM users WHERE id = ?",
        [userId],
        (err, row) => {

            if (err) return callback(null);

            if (!row) {

                db.run(
                    "INSERT INTO users (id, xp, level, messages, invites) VALUES (?, 0, 1, 0, 0)",
                    [userId]
                );

                return callback({
                    id: userId,
                    xp: 0,
                    level: 1,
                    messages: 0,
                    invites: 0
                });
            }

            callback(row);
        }
    );
}

// ================= ADD XP (CORE ENGINE) =================
function addXP(userId, amount, callback) {

    getUser(userId, (user) => {

        if (!user) return;

        let xp = user.xp + amount;
        let level = user.level;
        let leveledUp = false;

        // ================= LEVEL CHECK LOOP =================
        while (xp >= xpForLevel(level)) {

            xp -= xpForLevel(level);
            level += 1;
            leveledUp = true;
        }

        db.run(
            "UPDATE users SET xp = ?, level = ?, messages = messages + 1 WHERE id = ?",
            [xp, level, userId]
        );

        if (leveledUp && callback) {

            callback({
                userId,
                newLevel: level
            });
        }
    });
}

// ================= INVITE BONUS =================
function addInvite(userId) {

    db.run(
        "UPDATE users SET invites = invites + 1, xp = xp + 50 WHERE id = ?",
        [userId]
    );
}

// ================= DAILY BONUS =================
function addDaily(userId, streak) {

    const bonus = 50 + (streak * 10);

    db.run(
        "UPDATE users SET xp = xp + ?, messages = messages + 1 WHERE id = ?",
        [bonus, userId]
    );

    return bonus;
}

module.exports = {
    addXP,
    addInvite,
    addDaily,
    xpForLevel
};