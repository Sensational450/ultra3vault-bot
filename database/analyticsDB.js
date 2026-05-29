// ================= VIP ANALYTICS DATABASE =================

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database/analytics.sqlite");

// ================= INIT TABLES =================
db.serialize(() => {

    // VIP USERS
    db.run(`
        CREATE TABLE IF NOT EXISTS vip_users (
            user_id TEXT PRIMARY KEY,
            started_at INTEGER,
            expires_at INTEGER
        )
    `);

    // RSS STATS
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            feed TEXT,
            timestamp INTEGER
        )
    `);

    // SECURITY LOGS
    db.run(`
        CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            title TEXT,
            risk TEXT,
            timestamp INTEGER
        )
    `);

    // VIP EVENTS
    db.run(`
        CREATE TABLE IF NOT EXISTS vip_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event TEXT,
            timestamp INTEGER
        )
    `);

    console.log("📊 VIP Analytics DB ready");
});

// ================= VIP USERS =================
function addVIP(userId, durationDays = 7) {
    const now = Date.now();
    const expires = now + durationDays * 24 * 60 * 60 * 1000;

    db.run(
        `INSERT OR REPLACE INTO vip_users (user_id, started_at, expires_at)
         VALUES (?, ?, ?)`,
        [userId, now, expires]
    );
}

function getVIP(userId, callback) {
    db.get(
        `SELECT * FROM vip_users WHERE user_id = ?`,
        [userId],
        callback
    );
}

// ================= RSS STATS =================
function logRSS(category, feed) {
    db.run(
        `INSERT INTO rss_stats (category, feed, timestamp)
         VALUES (?, ?, ?)`,
        [category, feed, Date.now()]
    );
}

// ================= SECURITY LOG =================
function logSecurity(type, title, risk) {
    db.run(
        `INSERT INTO security_logs (type, title, risk, timestamp)
         VALUES (?, ?, ?, ?)`,
        [type, title, risk, Date.now()]
    );
}

// ================= VIP EVENTS =================
function logVIPEvent(userId, event) {
    db.run(
        `INSERT INTO vip_events (user_id, event, timestamp)
         VALUES (?, ?, ?)`,
        [userId, event, Date.now()]
    );
}

module.exports = {
    addVIP,
    getVIP,
    logRSS,
    logSecurity,
    logVIPEvent
};