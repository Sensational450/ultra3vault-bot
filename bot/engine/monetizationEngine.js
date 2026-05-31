const db = require("../../database/db");

// ================= VIP PRICES =================
const VIP_TIERS = {
    VIP: { cost: 1000, multiplier: 2 },
    PRO: { cost: 3000, multiplier: 3 },
    ELITE: { cost: 7000, multiplier: 5 }
};

// ================= BOOSTERS =================
const BOOSTERS = {
    SMALL: { cost: 300, multiplier: 1.5, duration: 30 },
    MEDIUM: { cost: 800, multiplier: 2, duration: 60 },
    ULTRA: { cost: 2000, multiplier: 3, duration: 120 }
};

// ================= GET BALANCE =================
function getBalance(userId, callback) {
    db.get(
        "SELECT points FROM users WHERE id = ?",
        [userId],
        (err, row) => {
            if (err || !row) return callback(0);
            callback(row.points);
        }
    );
}

// ================= DEDUCT BALANCE =================
function deductBalance(userId, amount, callback) {

    db.run(
        "UPDATE users SET points = points - ? WHERE id = ?",
        [amount, userId],
        (err) => {
            callback(!err);
        }
    );
}

// ================= BUY VIP =================
function buyVIP(userId, tier, callback) {

    const vip = VIP_TIERS[tier];
    if (!vip) return callback(false, "Invalid tier");

    getBalance(userId, (balance) => {

        if (balance < vip.cost) {
            return callback(false, "Not enough points");
        }

        deductBalance(userId, vip.cost, (success) => {

            if (!success) return callback(false);

            const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

            db.run(
                `INSERT OR REPLACE INTO vip_users (userId, tier, multiplier, expiresAt)
                 VALUES (?, ?, ?, ?)`,
                [userId, tier, vip.multiplier, expiresAt]
            );

            callback(true, `VIP ${tier} activated`);
        });
    });
}

// ================= BUY BOOSTER =================
function buyBooster(userId, type, callback) {

    const booster = BOOSTERS[type];
    if (!booster) return callback(false, "Invalid booster");

    getBalance(userId, (balance) => {

        if (balance < booster.cost) {
            return callback(false, "Not enough points");
        }

        deductBalance(userId, booster.cost, (success) => {

            if (!success) return callback(false);

            const expiresAt = Date.now() + booster.duration * 60 * 1000;

            db.run(
                `INSERT INTO boosters (userId, multiplier, expiresAt, type)
                 VALUES (?, ?, ?, ?)`,
                [userId, booster.multiplier, expiresAt, type]
            );

            callback(true, `${type} booster activated`);
        });
    });
}

// ================= REDEEM CODE SYSTEM =================
function redeemCode(userId, code, callback) {

    db.get(
        "SELECT * FROM redeem_codes WHERE code = ?",
        [code],
        (err, row) => {

            if (err || !row) return callback(false, "Invalid code");

            if (row.used) return callback(false, "Code already used");

            db.run("UPDATE redeem_codes SET used = 1 WHERE code = ?", [code]);

            db.run(
                "UPDATE users SET points = points + ? WHERE id = ?",
                [row.reward, userId]
            );

            callback(true, `You received ${row.reward} points`);
        }
    );
}

module.exports = {
    getBalance,
    buyVIP,
    buyBooster,
    redeemCode
};