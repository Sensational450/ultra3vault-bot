const sqlite3 = require("sqlite3").verbose();

console.log("📂 Opening DB: ./database/economy.sqlite");

const db = new sqlite3.Database("./database/economy.sqlite", (err) => {
    if (err) {
        console.error("❌ ECONOMY DB ERROR:", err.message);
    } else {
        console.log("✅ ECONOMY DB OPENED");
    }
});

db.serialize(() => {

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