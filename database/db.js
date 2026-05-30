const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/main.sqlite");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER
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

    console.log("🧠 Main DB ready");
});

module.exports = db;