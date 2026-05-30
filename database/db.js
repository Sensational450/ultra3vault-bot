const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/app.db");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tier TEXT DEFAULT 'FREE',
            expiresAt INTEGER
        )
    `);

    console.log("🧠 Main DB ready");
});

module.exports = db;