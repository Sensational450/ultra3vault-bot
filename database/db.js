const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "main.sqlite");

console.log("📂 OPENING MAIN DATABASE:", dbPath);

// ================= SINGLETON PROTECTION =================
if (global.__MAIN_DB__) {
    console.log("♻️ REUSING EXISTING MAIN DB CONNECTION");
    module.exports = global.__MAIN_DB__;
    return;
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ DB ERROR:", err.message);
    } else {
        console.log("🧠 MAIN DB CONNECTED");
    }
});

// store globally to prevent duplicate connections
global.__MAIN_DB__ = db;

// ================= SAFE CONFIG =================
db.serialize(() => {

    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA busy_timeout = 8000");

    // USERS
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER DEFAULT 0
        )
    `);

    // ECONOMY
    db.run(`
        CREATE TABLE IF NOT EXISTS economy (
            userId TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0
        )
    `);

    // DAILY STREAKS
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_streaks (
            userId TEXT PRIMARY KEY,
            streak INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0
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

    // RSS POSTS
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT UNIQUE,
            title TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    console.log("💰 MAIN DATABASE READY (SINGLE SAFE MODE)");
});

module.exports = db;