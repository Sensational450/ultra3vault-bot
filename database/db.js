const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/main.sqlite");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER,
            points INTEGER DEFAULT 0,
            lastClaim INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT UNIQUE,
            title TEXT,
            created_at INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            referred_by TEXT
        )
    `);

    console.log("🧠 MAIN DATABASE READY (PHASE 4 UPGRADED)");
});

module.exports = db;