const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "analytics.sqlite"));

db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");

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

    console.log("📊 VIP Analytics DB READY");
});

module.exports = db;