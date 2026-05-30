const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ================= DB INIT =================
const db = new sqlite3.Database(
    path.join(__dirname, "ultra3vault.db")
);

// ================= TABLES =================
db.serialize(() => {

    // USERS TABLE
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER DEFAULT NULL
        )
    `);

    // RSS POSTS TABLE
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            link TEXT PRIMARY KEY,
            title TEXT,
            createdAt INTEGER
        )
    `);
});

module.exports = db;