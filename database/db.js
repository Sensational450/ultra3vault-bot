const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/main.sqlite");

db.serialize(() => {

    // ================= USERS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER DEFAULT 0
        )
    `);

    // ================= RSS POSTS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT UNIQUE,
            title TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    // ================= DAILY STREAKS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_streaks (
            userId TEXT PRIMARY KEY,
            streak INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0
        )
    `);

    // ================= ECONOMY =================
    db.run(`
        CREATE TABLE IF NOT EXISTS economy (
            userId TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0
        )
    `);

    console.log("🧠 MAIN DATABASE READY (PHASE 4 UPGRADED)");
});

module.exports = db;