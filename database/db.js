const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/main.sqlite");

// ================= INIT =================
db.serialize(() => {

    // ================= USERS (SUBSCRIPTIONS) =================
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER
        )
    `);

    // ================= RSS POSTS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT UNIQUE,
            title TEXT,
            created_at INTEGER
        )
    `);

    // ================= REFERRALS (PHASE 4 READY) =================
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            userId TEXT PRIMARY KEY,
            code TEXT UNIQUE,
            invites INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            created_at INTEGER
        )
    `);

    // ================= DAILY REWARDS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_rewards (
            userId TEXT PRIMARY KEY,
            lastClaim INTEGER,
            streak INTEGER DEFAULT 0
        )
    `);

    // ================= ANALYTICS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            value TEXT,
            created_at INTEGER
        )
    `);

    // ================= SAFETY LOGS =================
    db.run(`
        CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            title TEXT,
            risk TEXT,
            created_at INTEGER
        )
    `);

    console.log("🧠 Main DB FULLY INITIALIZED (Phase 3 Ready)");
});

// ================= SAFE WRAPPERS =================
function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// ================= EXPORT =================
module.exports = {
    db,
    run,
    get,
    all
};