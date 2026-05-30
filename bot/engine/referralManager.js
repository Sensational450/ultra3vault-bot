const db = require("../../database/referrals.sqlite");

// generate code
function generateCode(userId) {
    return "ULTRA-" + userId.slice(-5);
}

// get or create referral
function getReferral(userId, callback) {

    db.get(
        "SELECT * FROM referrals WHERE userId = ?",
        [userId],
        (err, row) => {

            if (row) return callback(row);

            const code = generateCode(userId);

            db.run(
                "INSERT INTO referrals (userId, refCode) VALUES (?, ?)",
                [userId, code]
            );

            callback({
                userId,
                refCode: code,
                invites: 0,
                points: 0
            });
        }
    );
}

// reward referral
function addReferral(refCode) {

    db.run(
        "UPDATE referrals SET invites = invites + 1, points = points + 10 WHERE refCode = ?",
        [refCode]
    );
}

module.exports = {
    getReferral,
    addReferral
};