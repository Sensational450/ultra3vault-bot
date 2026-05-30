const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database/main.sqlite");

// ================= INIT =================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            referred_by TEXT
        )
    `);

    console.log("🤝 Referral system ready");
});

// ================= GENERATE CODE =================
function generateCode(userId) {
    return "ULTRA-" + userId.slice(-6);
}

// ================= GET OR CREATE USER =================
function getReferral(userId, callback) {

    db.get(
        "SELECT * FROM referrals WHERE userId = ?",
        [userId],
        (err, row) => {

            if (err) return console.log("REFERRAL DB ERROR:", err.message);

            if (row) return callback(row);

            const code = generateCode(userId);

            db.run(
                `INSERT INTO referrals (userId, code, invites, points)
                 VALUES (?, ?, 0, 0)`,
                [userId, code]
            );

            callback({
                userId,
                code,
                invites: 0,
                points: 0
            });
        }
    );
}

// ================= ADD REFERRAL (SAFE) =================
function addReferral(code, newUserId = null) {

    // prevent abuse if same user
    if (newUserId && code.includes(newUserId.slice(-3))) return;

    db.run(
        `
        UPDATE referrals
        SET invites = invites + 1,
            points = points + 10
        WHERE code = ?
        `,
        [code]
    );

    console.log(`🤝 Referral added for code: ${code}`);
}

// ================= LEADERBOARD =================
function getLeaderboard(callback) {
    db.all(
        `
        SELECT userId, invites, points
        FROM referrals
        ORDER BY points DESC
        LIMIT 10
        `,
        [],
        callback
    );
}

module.exports = {
    getReferral,
    addReferral,
    getLeaderboard
};