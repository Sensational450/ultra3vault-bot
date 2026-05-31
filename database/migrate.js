const db = require("./db");

const columns = [
    "xp INTEGER DEFAULT 0",
    "level INTEGER DEFAULT 1",
    "messages INTEGER DEFAULT 0",
    "invites INTEGER DEFAULT 0"
];

function addColumn(column) {
    db.run(`ALTER TABLE users ADD COLUMN ${column}`, (err) => {
        if (err && !err.message.includes("duplicate")) {
            console.log("⚠️ Migration skip:", err.message);
        } else {
            console.log("✅ Added:", column);
        }
    });
}

function migrate() {
    console.log("🧠 Running database migration v2.0");

    columns.forEach(addColumn);
}

module.exports = migrate;