const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/rss.db");

// create table
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS rss_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT UNIQUE,
            title TEXT,
            created_at INTEGER
        )
    `);
});

// check if exists
function hasPosted(link) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT link FROM rss_posts WHERE link = ?",
            [link],
            (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            }
        );
    });
}

// save post
function savePost(link, title) {
    db.run(
        "INSERT OR IGNORE INTO rss_posts (link, title, created_at) VALUES (?, ?, ?)",
        [link, title, Date.now()]
    );
}

module.exports = { hasPosted, savePost };