const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/app.db", (err) => {
    if (err) {
        console.error("❌ Database connection error:", err.message);
    } else {
        console.log("🧠 Main database connected");
    }
});

module.exports = db;