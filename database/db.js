const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ================= SINGLETON CONTROL =================
let dbInstance = null;

function getDB() {

    if (dbInstance) {
        return dbInstance;
    }

    const dbPath = path.join(__dirname, "main.sqlite");

    console.log("📂 OPENING MAIN DATABASE:", dbPath);

    dbInstance = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("❌ DB ERROR:", err.message);
        } else {
            console.log("🧠 MAIN DB CONNECTED (SINGLETON MODE)");
        }
    });

    dbInstance.serialize(() => {

        dbInstance.run("PRAGMA journal_mode = WAL");
        dbInstance.run("PRAGMA busy_timeout = 5000");

        // USERS
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                tier TEXT DEFAULT 'FREE',
                expiresAt INTEGER DEFAULT 0
            )
        `);

        // ECONOMY
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS economy (
                userId TEXT PRIMARY KEY,
                balance INTEGER DEFAULT 0
            )
        `);

        // DAILY
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS daily_streaks (
                userId TEXT PRIMARY KEY,
                streak INTEGER DEFAULT 0,
                lastClaim INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0
            )
        `);

        // REFERRALS
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS referrals (
                userId TEXT PRIMARY KEY,
                code TEXT UNIQUE,
                invites INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0
            )
        `);

        // RSS POSTS
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS rss_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                link TEXT UNIQUE,
                title TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        console.log("💰 DATABASE READY (SINGLE INSTANCE MODE)");
    });

    return dbInstance;
}

module.exports = getDB();