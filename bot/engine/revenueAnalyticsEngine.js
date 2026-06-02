const db = require("../../database/db");

// ================= TRACK REVENUE EVENT =================
function trackRevenue(event) {

    const {
        userId,
        itemType,
        itemId,
        amount = 0,
        currency = "USD",
        source = "system",
        aiTriggered = 0
    } = event;

    db.run(
        `
        INSERT INTO revenue_events
        (userId, itemType, itemId, amount, currency, source, aiTriggered)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
            userId,
            itemType,
            itemId,
            amount,
            currency,
            source,
            aiTriggered ? 1 : 0
        ]
    );
}

// ================= TOTAL REVENUE =================
function getTotalRevenue(callback) {

    db.get(
        `
        SELECT SUM(amount) as total
        FROM revenue_events
        `,
        [],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= USER LTV =================
function getUserLTV(userId, callback) {

    db.get(
        `
        SELECT SUM(amount) as total
        FROM revenue_events
        WHERE userId = ?
        `,
        [userId],
        (err, row) => {
            callback(row?.total || 0);
        }
    );
}

// ================= TOP CUSTOMERS =================
function getTopUsers(limit = 10, callback) {

    db.all(
        `
        SELECT userId, SUM(amount) as revenue
        FROM revenue_events
        GROUP BY userId
        ORDER BY revenue DESC
        LIMIT ?
        `,
        [limit],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

// ================= ITEM PERFORMANCE =================
function getItemPerformance(callback) {

    db.all(
        `
        SELECT itemType, itemId, SUM(amount) as revenue
        FROM revenue_events
        GROUP BY itemType, itemId
        ORDER BY revenue DESC
        `,
        [],
        (err, rows) => {
            callback(rows || []);
        }
    );
}

// ================= AI PERFORMANCE =================
function getAIPerformance(callback) {

    db.get(
        `
        SELECT
        SUM(CASE WHEN aiTriggered = 1 THEN amount ELSE 0 END) as aiRevenue,
        SUM(amount) as totalRevenue
        FROM revenue_events
        `,
        [],
        (err, row) => {

            const aiRevenue = row?.aiRevenue || 0;
            const total = row?.totalRevenue || 0;

            callback({
                aiRevenue,
                totalRevenue: total,
                aiContribution: total ? (aiRevenue / total) * 100 : 0
            });
        }
    );
}

module.exports = {
    trackRevenue,
    getTotalRevenue,
    getUserLTV,
    getTopUsers,
    getItemPerformance,
    getAIPerformance
};