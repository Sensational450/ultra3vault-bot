const db = require("../../database/db");

// ================= CREATE CODE =================
function createCode(code, reward, callback) {

db.run(
    `
    INSERT INTO redeem_codes
    (code, reward, used)
    VALUES (?, ?, 0)
    `,
    [code.toUpperCase(), reward],
    callback
);

}

// ================= REDEEM =================
function redeemCode(userId, code, callback) {

db.get(
    `
    SELECT *
    FROM redeem_codes
    WHERE code = ?
    `,
    [code.toUpperCase()],
    (err, row) => {

        if (err || !row) {
            return callback({
                success: false,
                message: "Invalid code"
            });
        }

        if (row.used) {
            return callback({
                success: false,
                message: "Code already used"
            });
        }

        db.run(
            `
            UPDATE redeem_codes
            SET used = 1
            WHERE code = ?
            `,
            [code.toUpperCase()]
        );

        callback({
            success: true,
            reward: row.reward
        });
    }
);

}

module.exports = {
createCode,
redeemCode
};