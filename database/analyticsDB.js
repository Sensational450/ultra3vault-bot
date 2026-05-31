const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "analytics.sqlite");

console.log("📂 Opening DB:", dbPath);

const db = new sqlite3.Database(
    dbPath,
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    (err) => {
        if (err) console.error("❌ ANALYTICS DB ERROR:", err.message);
        else console.log("💎 ANALYTICS DB OPENED");
    }
);

// ================= GLOBAL SAFETY =================
db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA busy_timeout = 8000");

    db.run(`
        CREATE TABLE IF NOT EXISTS vip_users (
            user_id TEXT PRIMARY KEY,
            started_at INTEGER,
            expires_at INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rss_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            feed TEXT,
            timestamp INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            title TEXT,
            risk TEXT,
            timestamp INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS vip_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event TEXT,
            timestamp INTEGER
        )
    `);

    console.log("📊 VIP ANALYTICS DB READY (SAFE MODE)");
});

// ================= SAFE EXPORTS =================
function logRSS(category, feed) {
    db.run(
        `INSERT INTO rss_stats (category, feed, timestamp)
         VALUES (?, ?, ?)`,
        [category, feed, Date.now()]
    );
}

function logSecurity(type, title, risk) {
    db.run(
        `INSERT INTO security_logs (type, title, risk, timestamp)
         VALUES (?, ?, ?, ?)`,
        [type, title, risk, Date.now()]
    );
}

module.exports = {
    db,
    logRSS,
    logSecurity
};