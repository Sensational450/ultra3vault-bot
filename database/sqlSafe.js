const sqlite3 = require("sqlite3").verbose();

// simple global queue
const queue = [];
let running = false;

function processQueue() {
    if (running) return;
    const job = queue.shift();
    if (!job) return;

    running = true;

    const { db, sql, params, resolve, reject } = job;

    db.run(sql, params, function (err) {
        running = false;

        if (err) reject(err);
        else resolve(this);

        processQueue();
    });
}

function safeRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        queue.push({ db, sql, params, resolve, reject });
        processQueue();
    });
}

module.exports = { safeRun };