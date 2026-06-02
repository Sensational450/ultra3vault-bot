const db = require("../../database/db");

// ================= TRACK REVENUE =================
function trackRevenue({
    userId,
    itemType,
    itemId,
    amount = 0,
    currency = "USD",
    source = "system"
}) {

    db.run(
        `INSERT INTO revenue
        (userId, itemType, itemId, amount, currency, source, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            itemType,
            itemId,
            amount,
            currency,
            source,
            Date.now()
        ]
    );
}

// ================= TOTAL REVENUE =================
function getTotalRevenue(callback) {

    db.get(
        `SELECT SUM(amount) as total FROM revenue`,
        [],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= DAILY REVENUE =================
function getDailyRevenue(callback) {

    const today = Date.now() - 86400000;

    db.get(
        `SELECT SUM(amount) as total
         FROM revenue
         WHERE createdAt >= ?`,
        [today],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= REVENUE BY TYPE =================
function getRevenueByType(callback) {

    db.all(
        `SELECT itemType, SUM(amount) as total
         FROM revenue
         GROUP BY itemType`,
        [],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

// ================= TOP USERS =================
function getTopBuyers(limit = 10, callback) {

    db.all(
        `SELECT userId, SUM(amount) as spent
         FROM revenue
         GROUP BY userId
         ORDER BY spent DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

// ================= ITEM PERFORMANCE =================
function getTopItems(callback) {

    db.all(
        `SELECT itemId, COUNT(*) as purchases, SUM(amount) as revenue
         FROM revenue
         GROUP BY itemId
         ORDER BY revenue DESC`,
        [],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

module.exports = {
    trackRevenue,
    getTotalRevenue,
    getDailyRevenue,
    getRevenueByType,
    getTopBuyers,
    getTopItems
};