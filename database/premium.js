const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./premium.db");

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS premium_users (
            user_id TEXT PRIMARY KEY,
            expires_at INTEGER
        )
    `);
});

module.exports = db;