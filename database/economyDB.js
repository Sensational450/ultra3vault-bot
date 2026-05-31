const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/economy.sqlite", (err) => {
    if (err) console.error(err.message);
    else console.log("✅ ECONOMY DB OPENED");
});

db.serialize(() => {

    // ✅ IMPORTANT FIX (prevents SQLITE_BUSY)
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            points INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0,
            referrals INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0
        )
    `);

    console.log("💰 Economy DB ready");
});

module.exports = db;