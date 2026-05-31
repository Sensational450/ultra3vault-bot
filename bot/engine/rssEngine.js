const db = require("../../database/db");

// safe in-memory fallback
const seenPosts = new Set();

function hasPosted(link) {
    return new Promise((resolve) => {
        db.get(
            "SELECT 1 FROM rss_posts WHERE link = ?",
            [link],
            (err, row) => {
                if (err) return resolve(false);
                resolve(!!row);
            }
        );
    });
}

function savePost(link, title) {
    db.run(
        "INSERT OR IGNORE INTO rss_posts (link, title) VALUES (?, ?)",
        [link, title]
    );
}