const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "analytics.sqlite");

console.log("📂 Opening DB:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ PREMIUM DB ERROR:", err.message);
    } else {
        console.log("💎 PREMIUM DB OPENED");
    }
});

db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");

    db.run(`
        CREATE TABLE IF NOT EXISTS premium_users (
            user_id TEXT PRIMARY KEY,
            expires_at INTEGER
        )
    `);

    console.log("💎 PREMIUM SYSTEM READY");
});

module.exports = db;