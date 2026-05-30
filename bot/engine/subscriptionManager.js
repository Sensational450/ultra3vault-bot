const db = require("../../database/db");

function getUserTier(userId, callback) {

    db.get(`
        SELECT tier, expiresAt
        FROM users
        WHERE id = ?
    `, [userId], (err, row) => {

        if (err || !row) {
            return callback("FREE");
        }

        if (row.expiresAt && Date.now() > row.expiresAt) {
            db.run(`
                UPDATE users
                SET tier = 'FREE', expiresAt = NULL
                WHERE id = ?
            `, [userId]);

            return callback("FREE");
        }

        callback(row.tier || "FREE");
    });
}

function setUserTier(userId, tier, days = 30) {

    const expiresAt = tier === "FREE"
        ? null
        : Date.now() + days * 86400000;

    db.run(`
        INSERT INTO users (id, tier, expiresAt)
        VALUES (?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET tier = excluded.tier,
        expiresAt = excluded.expiresAt
    `, [userId, tier, expiresAt]);
}

function hasAccess(userId, channelName, callback) {

    db.get(`
        SELECT tier FROM users WHERE id = ?
    `, [userId], (err, row) => {

        const tier = row?.tier || "FREE";

        const accessMap = {
            FREE: ["crypto-news"],
            VIP: ["crypto-news", "breaking-news"],
            VIP_ALPHA: ["crypto-news", "breaking-news", "whale-alerts", "security-alerts"]
        };

        const allowed = accessMap[tier]?.includes(channelName) || false;

        callback(allowed);
    });
}

module.exports = {
    getUserTier,
    setUserTier,
    hasAccess
};