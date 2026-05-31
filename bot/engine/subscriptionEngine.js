const db = require("../../database/db");

// ================= CREATE SUB =================
function createSubscription(userId, plan, days) {

    const start = Date.now();
    const expiry = start + days * 24 * 60 * 60 * 1000;

    db.run(`
        INSERT OR REPLACE INTO subscriptions
        (userId, plan, startDate, expiryDate, active)
        VALUES (?, ?, ?, ?, 1)
    `, [userId, plan, start, expiry]);
}

// ================= CHECK SUB =================
function getSubscription(userId, cb) {

    db.get(`
        SELECT * FROM subscriptions WHERE userId = ?
    `, [userId], (err, row) => {

        if (!row) {
            return cb({
                active: false,
                plan: "FREE"
            });
        }

        const now = Date.now();

        if (row.expiryDate < now) {
            db.run(`
                UPDATE subscriptions SET active = 0 WHERE userId = ?
            `, [userId]);

            return cb({
                active: false,
                plan: "EXPIRED"
            });
        }

        cb({
            active: true,
            plan: row.plan,
            expiry: row.expiryDate
        });
    });
}

// ================= EXPORTS =================
module.exports = {
    createSubscription,
    getSubscription
};