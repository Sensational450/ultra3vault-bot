const sqlite3 = require("sqlite3").verbose();

console.log("📂 Opening DB: ./premium.db");

const db = new sqlite3.Database("./premium.db", (err) => {
    if (err) {
        console.error("❌ PREMIUM DB OPEN ERROR:", err.message);
    } else {
        console.log("✅ PREMIUM DB OPENED");
    }
});

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS premium_users (
            user_id TEXT PRIMARY KEY,
            expires_at INTEGER
        )
    `);

    console.log("💎 Premium DB ready");
});

module.exports = db;