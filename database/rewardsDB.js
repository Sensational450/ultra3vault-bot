const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/rewards.sqlite", (err) => {
    if (err) {
        console.error("❌ Rewards DB Error:", err.message);
    } else {
        console.log("💰 Rewards DB ready");
    }
});

db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            streak INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            totalClaims INTEGER DEFAULT 0,
            createdAt INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            createdAt INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_referral_code
        ON referrals(code)
    `);

});

module.exports = db;