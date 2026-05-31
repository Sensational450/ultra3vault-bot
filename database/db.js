const sqlite3 = require("sqlite3").verbose();

console.log("📂 Opening DB: ./database/main.sqlite");

const db = new sqlite3.Database("./database/main.sqlite", (err) => {
    if (err) console.error(err.message);
    else console.log("🧠 MAIN DB OPENED");
});

db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");

    // USERS (economy + streak)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            points INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0
        )
    `);

    // REFERRALS
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0
        )
    `);

    console.log("💰 MAIN ECONOMY READY");
});

module.exports = db;