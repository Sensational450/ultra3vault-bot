const db = require("../../database/referrals.sqlite");

function generateCode(userId) {
    return "ULTRA-" + userId.slice(-5);
}

function getReferral(userId, callback) {

    db.get(
        "SELECT * FROM referrals WHERE userId = ?",
        [userId],
        (err, row) => {

            if (row) return callback(row);

            const code = generateCode(userId);

            db.run(
                "INSERT INTO referrals (userId, code) VALUES (?, ?)",
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

function addReferral(code) {

    db.run(
        "UPDATE referrals SET invites = invites + 1, points = points + 10 WHERE code = ?",
        [code]
    );
}

module.exports = {
    getReferral,
    addReferral
};