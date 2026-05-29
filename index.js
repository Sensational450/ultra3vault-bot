// ================= MAIN STARTER =================

// handle crashes
process.on("uncaughtException", (err) => console.log("CRASH:", err));
process.on("unhandledRejection", (err) => console.log("PROMISE ERROR:", err));

// load environment
require("dotenv").config();

// start bot client
const client = require("./bot/client");

// load RSS system (FIXED: matches rss.js lowercase file)
const fetchRSS = require("./bot/rss.js");

// start web server
require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// run RSS every 10 minutes (only after client is ready)
client.once("ready", () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // run immediately once
    fetchRSS(client);

    // run every 10 minutes
    setInterval(() => {
        fetchRSS(client);
    }, 10 * 60 * 1000);
});