const { cleanupExpired } = require("../bot/services/subscriptionManager");

function startCleanupJob(client) {

    setInterval(() => {
        cleanupExpired(client);
    }, 60 * 60 * 1000);
}

module.exports = { startCleanupJob };