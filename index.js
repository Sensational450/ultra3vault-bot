const dotenv = require("dotenv");
dotenv.config();

// ================= CRASH HANDLERS =================
process.on("uncaughtException", (err) => console.log("CRASH:", err));
process.on("unhandledRejection", (err) => console.log("PROMISE ERROR:", err));

// ================= START BOT =================
const client = require("./bot/client");

// ================= SERVICES =================
const fetchRSS = require("./bot/rss.js");
const fetchPrices = require("./bot/priceAlert"); // 📈 NEW: price system
require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// ================= READY EVENT =================
client.once("ready", () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= RSS SYSTEM =================
    console.log("📡 Starting RSS engine...");
    fetchRSS(client);

    setInterval(() => {
        fetchRSS(client);
    }, 10 * 60 * 1000); // 10 minutes

    // ================= PRICE ALERT SYSTEM =================
    console.log("📊 Starting price alert system...");
    fetchPrices(client);

    setInterval(() => {
        fetchPrices(client);
    }, 60 * 1000); // 1 minute

});