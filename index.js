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

// ================= SAFETY FLAGS =================
let started = false;

let rssInterval = null;
let priceInterval = null;
let cleanupInterval = null;

// ================= READY =================
client.once("ready", async () => {

    if (started) return; // prevents Render double boot
    started = true;

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= WEBHOOK =================
    try {
        attachClient?.(client);
    } catch (e) {
        console.log("❌ Webhook error:", e.message);
    }

    // ================= RSS ENGINE =================
    console.log("📡 RSS engine starting...");

    // run immediately once
    try {
        await fetchRSS(client);
    } catch (e) {
        console.log("❌ RSS initial error:", e.message);
    }

    // clear old interval if exists (extra safety)
    if (rssInterval) clearInterval(rssInterval);

    rssInterval = setInterval(async () => {
        try {
            await fetchRSS(client);
        } catch (e) {
            console.log("❌ RSS ERROR:", e.message);
        }
    }, 12 * 60 * 1000); // 🔥 increased to 12 min (reduces overload)

    // ================= PRICE ENGINE =================
    console.log("📊 Price system starting...");

    try {
        await fetchPrices(client);
    } catch (e) {
        console.log("❌ PRICE initial error:", e.message);
    }

    if (priceInterval) clearInterval(priceInterval);

    priceInterval = setInterval(async () => {
        try {
            await fetchPrices(client);
        } catch (e) {
            console.log("❌ PRICE ERROR:", e.message);
        }
    }, 90 * 1000); // 🔥 1.5 min (reduces CoinGecko 429)

    // ================= CLEANUP =================
    console.log("🔁 Cleanup loop starting...");

    if (cleanupInterval) clearInterval(cleanupInterval);

    cleanupInterval = setInterval(async () => {
        try {
            await cleanupExpired(client);
        } catch (e) {
            console.log("❌ CLEANUP ERROR:", e.message);
        }
    }, 60 * 60 * 1000);

    console.log("🚀 SYSTEM FULLY STABLE");
});