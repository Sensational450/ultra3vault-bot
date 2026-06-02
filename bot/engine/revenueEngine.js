const db = require("../../database/db");

// ================= TRACK REVENUE =================
function trackRevenue({
    userId,
    itemType,
    itemId,
    amount,
    source = "shop"
}) {

    db.run(
        `
        INSERT INTO revenue
        (userId, itemType, itemId, amount, source)
        VALUES (?, ?, ?, ?, ?)
        `,
        [userId, itemType, itemId, amount, source]
    );
}

// ================= TOTAL REVENUE =================
function getTotalRevenue(callback) {

    db.get(
        `
        SELECT SUM(amount) as total
        FROM revenue
        `,
        [],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= USER REVENUE =================
function getUserRevenue(userId, callback) {

    db.get(
        `
        SELECT SUM(amount) as total
        FROM revenue
        WHERE userId = ?
        `,
        [userId],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= ITEM PERFORMANCE =================
function getItemStats(itemId, callback) {

    db.get(
        `
        SELECT COUNT(*) as sales, SUM(amount) as revenue
        FROM revenue
        WHERE itemId = ?
        `,
        [itemId],
        (err, row) => {
            callback(row || { sales: 0, revenue: 0 });
        }
    );
}

module.exports = {
    trackRevenue,
    getTotalRevenue,
    getUserRevenue,
    getItemStats
};