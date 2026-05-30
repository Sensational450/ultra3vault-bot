const dotenv = require("dotenv");
dotenv.config();

// ================= CRASH HANDLERS =================
process.on("uncaughtException", err =>
    console.log("💥 CRASH:", err)
);

process.on("unhandledRejection", err =>
    console.log("⚠️ PROMISE ERROR:", err)
);

// ================= IMPORTS =================
const client = require("./bot/client");
const fetchRSS = require("./bot/rss");
const fetchPrices = require("./bot/priceAlert");
const { attachClient } = require("./bot/routes/nowpayWebhook");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// ================= SAFE GUARD =================
let started = false;

// ================= READY =================
client.once("ready", async () => {

    if (started) return; // IMPORTANT FIX (Render double boot)
    started = true;

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    try {
        attachClient?.(client);
    } catch (e) {
        console.log("❌ Webhook error:", e.message);
    }

    // ================= RSS =================
    console.log("📡 RSS engine starting...");
    setInterval(() => fetchRSS(client).catch(() => {}), 10 * 60 * 1000);

    // ================= PRICE =================
    console.log("📊 Price system starting...");
    setInterval(() => fetchPrices(client).catch(() => {}), 60 * 1000);

    // ================= CLEANUP =================
    console.log("🔁 Cleanup loop starting...");
    setInterval(() => cleanupExpired(client).catch(() => {}), 60 * 60 * 1000);

    // initial run
    await fetchRSS(client);
    await fetchPrices(client);

    console.log("🚀 SYSTEM FULLY STABLE");
});