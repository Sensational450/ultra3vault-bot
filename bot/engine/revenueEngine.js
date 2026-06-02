const db = require("../../database/db");

// ================= CORE TRACKER =================
function trackRevenue({
    userId,
    itemType,
    itemId,
    amount = 0,
    currency = "USD",
    source = "system",
    meta = {}
}) {

    db.run(
        `INSERT INTO revenue
        (userId, itemType, itemId, amount, currency, source, meta, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            itemType,
            itemId,
            amount,
            currency,
            source,
            JSON.stringify(meta),
            Date.now()
        ]
    );
}

// ================= TOTAL REVENUE =================
function getTotalRevenue(cb) {
    db.get(`SELECT SUM(amount) as total FROM revenue`, [], (e, r) => {
        cb(r?.total || 0);
    });
}

// ================= DAILY REVENUE =================
function getDailyRevenue(cb) {
    const today = Date.now() - 86400000;

    db.get(
        `SELECT SUM(amount) as total FROM revenue WHERE createdAt >= ?`,
        [today],
        (e, r) => cb(r?.total || 0)
    );
}

// ================= MONTHLY REVENUE =================
function getMonthlyRevenue(cb) {
    const month = Date.now() - 30 * 86400000;

    db.get(
        `SELECT SUM(amount) as total FROM revenue WHERE createdAt >= ?`,
        [month],
        (e, r) => cb(r?.total || 0)
    );
}

// ================= MRR (SAAS CORE METRIC) =================
function getMRR(cb) {
    db.get(
        `SELECT SUM(amount) as mrr
         FROM revenue
         WHERE itemType = 'VIP'
         AND createdAt >= ?`,
        [Date.now() - 30 * 86400000],
        (e, r) => cb(r?.mrr || 0)
    );
}

// ================= TOP USERS =================
function getTopBuyers(limit = 10, cb) {
    db.all(
        `SELECT userId, SUM(amount) as spent
         FROM revenue
         GROUP BY userId
         ORDER BY spent DESC
         LIMIT ?`,
        [limit],
        (e, rows) => cb(rows || [])
    );
}

// ================= PRODUCT PERFORMANCE =================
function getTopProducts(cb) {
    db.all(
        `SELECT itemId,
                COUNT(*) as purchases,
                SUM(amount) as revenue
         FROM revenue
         GROUP BY itemId
         ORDER BY revenue DESC`,
        [],
        (e, rows) => cb(rows || [])
    );
}

// ================= VIP INSIGHTS =================
function getVIPStats(cb) {
    db.all(
        `SELECT tier, COUNT(*) as count
         FROM vip_users
         GROUP BY tier`,
        [],
        (e, rows) => cb(rows || [])
    );
}

// ================= ARPU =================
function getARPU(cb) {
    db.get(
        `SELECT
            SUM(amount) * 1.0 / COUNT(DISTINCT userId) as arpu
         FROM revenue`,
        [],
        (e, r) => cb(r?.arpu || 0)
    );
}

module.exports = {
    trackRevenue,
    getTotalRevenue,
    getDailyRevenue,
    getMonthlyRevenue,
    getMRR,
    getTopBuyers,
    getTopProducts,
    getVIPStats,
    getARPU
};