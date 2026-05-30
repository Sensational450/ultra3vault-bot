const fetchRSS = require("../bot/engine/rssEngine");

function startRSSJob(client) {

    // run immediately
    fetchRSS(client);

    setInterval(() => {
        fetchRSS(client);
    }, 12 * 60 * 1000); // safe interval
}

module.exports = { startRSSJob };