const dotenv = require("dotenv");
dotenv.config();

// ================= CRASH HANDLERS =================
process.on("uncaughtException", (err) => {
    console.log("💥 CRASH:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("⚠️ PROMISE ERROR:", err);
});

// ================= IMPORTS =================
const client = require("./bot/client");

const fetchRSS = require("./bot/rss.js");
const fetchPrices = require("./bot/priceAlert");

const { attachClient: attachNowPay } = require("./bot/routes/nowpayWebhook");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// ================= SYSTEM STATE =================
let initialized = false;

// ================= READY EVENT =================
client.once("ready", async () => {

    // Prevent Render double-start issues
    if (initialized) return;
    initialized = true;

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= WEBHOOK =================
    try {
        attachNowPay(client);
        console.log("💳 NOWPayments webhook connected");
    } catch (err) {
        console.log("❌ Webhook error:", err.message);
    }

    // ================= RSS ENGINE =================
    console.log("📡 Starting RSS engine...");

    try {
        await fetchRSS(client);
    } catch (err) {
        console.log("❌ RSS initial error:", err.message);
    }

    setInterval(async () => {
        try {
            await fetchRSS(client);
        } catch (err) {
            console.log("❌ RSS ERROR:", err.message);
        }
    }, 10 * 60 * 1000);

    // ================= PRICE ENGINE =================
    console.log("📊 Starting price alert system...");

    try {
        await fetchPrices(client);
    } catch (err) {
        console.log("❌ PRICE initial error:", err.message);
    }

    setInterval(async () => {
        try {
            await fetchPrices(client);
        } catch (err) {
            console.log("❌ PRICE ERROR:", err.message);
        }
    }, 60 * 1000);

    // ================= SUBSCRIPTION CLEANUP =================
    console.log("🔁 Starting subscription cleanup loop...");

    setInterval(async () => {
        try {
            await cleanupExpired(client);
        } catch (err) {
            console.log("❌ CLEANUP ERROR:", err.message);
        }
    }, 60 * 60 * 1000);

    console.log("🚀 All systems initialized successfully");
});