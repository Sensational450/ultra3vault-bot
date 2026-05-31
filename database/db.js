const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "main.sqlite");

console.log("📂 Opening DB:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ MAIN DB ERROR:", err.message);
    } else {
        console.log("🧠 MAIN DB OPENED");
    }
});

// ================= GLOBAL SAFETY SETTINGS =================
db.serialize(() => {

    // 🔥 Prevent locked DB crashes
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA busy_timeout = 5000");

    // ================= USERS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER DEFAULT 0
        )
    `);

    // ================= RSS =================
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
            lastClaim INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0
        )
    `);

    // ================= ECONOMY =================
    db.run(`
        CREATE TABLE IF NOT EXISTS economy (
            userId TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0
        )
    `);

    // ================= REFERRALS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            createdAt INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    // ================= INDEXES (SPEED BOOST) =================
    db.run(`CREATE INDEX IF NOT EXISTS idx_ref_code ON referrals(code)`);

    console.log("💰 MAIN DATABASE READY (PHASE 4 STABLE + SAFE)");
});

module.exports = db;