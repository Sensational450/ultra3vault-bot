const db = require("../../database/db");

// ================= UPDATE USER POINTS =================
function addPoints(userId, points = 1) {

    db.run(`
        INSERT INTO users (id, tier, expiresAt)
        VALUES (?, 'FREE', NULL)
        ON CONFLICT(id)
        DO NOTHING
    `, [userId]);

    db.run(`
        UPDATE users
        SET points = COALESCE(points, 0) + ?
        WHERE id = ?
    `, [points, userId]);
}

// ================= GET LEADERBOARD =================
function getLeaderboard(limit = 10, callback) {

    db.all(`
        SELECT id, points, tier
        FROM users
        ORDER BY points DESC
        LIMIT ?
    `, [limit], callback);
}

module.exports = {
    addPoints,
    getLeaderboard
};