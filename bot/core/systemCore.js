let intervals = [];

function safeInterval(fn, time) {
    const id = setInterval(async () => {
        try {
            await fn();
        } catch (err) {
            console.log("❌ SYSTEM ERROR:", err.message);
        }
    }, time);

    intervals.push(id);
    return id;
}

function stopAll() {
    for (const id of intervals) {
        clearInterval(id);
    }
    intervals = [];
}

module.exports = {
    safeInterval,
    stopAll
};
