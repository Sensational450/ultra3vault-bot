const { startRSSJob } = require("./rssJob");
const { startPriceJob } = require("./priceJob");
const { startCleanupJob } = require("./cleanupJob");

function startJobs(client) {

    console.log("📡 Starting RSS Job...");
    startRSSJob(client);

    console.log("📊 Starting Price Job...");
    startPriceJob(client);

    console.log("🔁 Starting Cleanup Job...");
    startCleanupJob(client);
}

module.exports = { startJobs };
