const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ================= SINGLETON =================
let dbInstance = null;

function getDB() {

    if (dbInstance) return dbInstance;

    const dbPath = path.join(__dirname, "main.sqlite");

    console.log("📂 OPENING MAIN DATABASE:", dbPath);

    dbInstance = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error("❌ DB ERROR:", err.message);
        else console.log("🧠 MAIN DB CONNECTED (v3.1 AI CORE)");
    });

    dbInstance.serialize(() => {

        // ================= PERFORMANCE =================
        dbInstance.run("PRAGMA journal_mode = WAL");
        dbInstance.run("PRAGMA busy_timeout = 5000");

        // ================= USERS CORE =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,

                tier TEXT DEFAULT 'FREE',
                expiresAt INTEGER DEFAULT 0,

                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,

                messages INTEGER DEFAULT 0,
                invites INTEGER DEFAULT 0,

                points INTEGER DEFAULT 0,

                streak INTEGER DEFAULT 0,
                lastDaily INTEGER DEFAULT 0
            )
        `);

        // ================= ECONOMY =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS economy (
                userId TEXT PRIMARY KEY,
                balance INTEGER DEFAULT 0
            )
        `);

        // ================= DAILY SYSTEM =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS daily_streaks (
                userId TEXT PRIMARY KEY,
                streak INTEGER DEFAULT 0,
                lastClaim INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0
            )
        `);

        // ================= REFERRALS =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS referrals (
                userId TEXT PRIMARY KEY,
                code TEXT UNIQUE,
                invites INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0
            )
        `);

        // ================= RSS EVENTS =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS rss_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                link TEXT UNIQUE,
                title TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        // ================= VIP SYSTEM =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS vip_users (
                userId TEXT PRIMARY KEY,
                tier TEXT DEFAULT 'FREE',
                multiplier REAL DEFAULT 1,
                expiresAt INTEGER
            )
        `);

        // ================= BOOSTERS =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS boosters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                multiplier REAL,
                type TEXT,
                expiresAt INTEGER
            )
        `);

        // ================= REDEEM CODES =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS redeem_codes (
                code TEXT PRIMARY KEY,
                reward INTEGER,
                used INTEGER DEFAULT 0
            )
        `);

        // ================= ACHIEVEMENTS =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                achievement TEXT,
                earnedAt INTEGER
            )
        `);

        // ================= XP LOGS =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS xp_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                xp INTEGER,
                source TEXT,
                createdAt INTEGER
            )
        `);

        // ================= 💰 REVENUE SYSTEM =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS revenue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                itemType TEXT,
                itemId TEXT,
                amount REAL DEFAULT 0,
                currency TEXT DEFAULT 'USD',
                source TEXT,
                createdAt INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        // ================= 🧠 AI USER MEMORY SYSTEM v2.2 =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS user_memory (
                userId TEXT PRIMARY KEY,

                engagementScore INTEGER DEFAULT 0,
                activityScore INTEGER DEFAULT 0,
                monetizationScore INTEGER DEFAULT 0,

                lastSeen INTEGER,
                totalMessages INTEGER DEFAULT 0,

                vipLikelihood REAL DEFAULT 0,
                churnRisk REAL DEFAULT 0,

                xpVelocity REAL DEFAULT 0
            )
        `);

        // ================= 🧠 AI EVENT BUFFER (NEW) =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                eventType TEXT,
                payload TEXT,
                processed INTEGER DEFAULT 0,
                createdAt INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        // ================= 🧠 AI DECISIONS (NEW) =================
        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS ai_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                decisionType TEXT,
                input TEXT,
                output TEXT,
                confidence REAL,
                createdAt INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        console.log("💰 DATABASE READY (v3.1 FULL AI + MONETIZATION CORE)");
    });

    return dbInstance;
}

module.exports = getDB();