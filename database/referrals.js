const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database/main.sqlite");

// ================= INIT =================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            user_id TEXT PRIMARY KEY,
            referred_by TEXT,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0
        )
    `);

    console.log("🤝 Referral DB ready");
});

// ================= ADD REFERRAL =================
function addReferral(userId, referrerId) {

    if (!referrerId || userId === referrerId) return;

    db.run(`
        INSERT OR IGNORE INTO referrals (user_id, referred_by, invites, points)
        VALUES (?, ?, 0, 0)
    `, [userId, referrerId]);

    db.run(`
        UPDATE referrals
        SET invites = invites + 1,
            points = points + 10
        WHERE user_id = ?
    `, [referrerId]);
}

// ================= GET USER REF =================
function getReferral(userId, callback) {
    db.get(
        `SELECT * FROM referrals WHERE user_id = ?`,
        [userId],
        callback
    );
}

// ================= LEADERBOARD =================
function getTopReferrers(callback) {
    db.all(
        `SELECT user_id, invites, points 
         FROM referrals 
         ORDER BY points DESC 
         LIMIT 10`,
        [],
        callback
    );
}

module.exports = {
    addReferral,
    getReferral,
    getTopReferrers
};