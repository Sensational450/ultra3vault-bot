const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/referrals.sqlite");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            referredBy TEXT DEFAULT NULL,
            createdAt INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referral_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer TEXT,
            referred TEXT,
            code TEXT,
            timestamp INTEGER
        )
    `);

    console.log("👥 Referral DB ready");
});

module.exports = db;