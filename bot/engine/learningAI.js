// ================= SELF LEARNING AI =================

const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database/learning.sqlite");

// ================= INIT =================
db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS ai_memory (
            keyword TEXT PRIMARY KEY,
            score INTEGER DEFAULT 0
        )
    `);

    console.log("🧠 Learning AI ready");
});

// ================= LEARN GOOD =================
function learnPositive(text = "") {

    const words = text.toLowerCase().split(/\s+/);

    words.forEach(word => {

        if (word.length < 4) return;

        db.run(`
            INSERT INTO ai_memory (keyword, score)
            VALUES (?, 1)
            ON CONFLICT(keyword)
            DO UPDATE SET score = score + 1
        `, [word]);
    });
}

// ================= LEARN BAD =================
function learnNegative(text = "") {

    const words = text.toLowerCase().split(/\s+/);

    words.forEach(word => {

        if (word.length < 4) return;

        db.run(`
            INSERT INTO ai_memory (keyword, score)
            VALUES (?, -1)
            ON CONFLICT(keyword)
            DO UPDATE SET score = score - 1
        `, [word]);
    });
}

// ================= GET AI BOOST =================
function getLearningScore(text = "") {

    return new Promise((resolve) => {

        const words = text.toLowerCase().split(/\s+/);

        let total = 0;
        let checked = 0;

        words.forEach(word => {

            if (word.length < 4) return;

            checked++;

            db.get(
                `SELECT score FROM ai_memory WHERE keyword = ?`,
                [word],
                (err, row) => {

                    if (row) {
                        total += row.score;
                    }

                    checked--;

                    if (checked <= 0) {
                        resolve(total);
                    }
                }
            );
        });

        if (words.length === 0) {
            resolve(0);
        }
    });
}

module.exports = {
    learnPositive,
    learnNegative,
    getLearningScore
};