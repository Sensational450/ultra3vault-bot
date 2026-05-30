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

// ================= SUBSCRIPTION SYSTEM (NEW) =================
const {
    cleanupExpired
} = require("./bot/engine/subscriptionManager");

require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// ================= SYSTEM FLAGS =================
let rssStarted = false;
let priceStarted = false;
let cleanupStarted = false;

// ================= READY EVENT =================
client.once("ready", async () => {

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= NOWPAYMENTS WEBHOOK =================
    try {
        attachNowPay(client);
        console.log("💳 NOWPayments webhook connected");
    } catch (err) {
        console.log("❌ Webhook error:", err.message);
    }

    // ================= RSS ENGINE =================
    if (!rssStarted) {
        rssStarted = true;

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
    }

    // ================= PRICE ENGINE =================
    if (!priceStarted) {
        priceStarted = true;

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
    }

    // ================= SUBSCRIPTION CLEANUP LOOP (NEW) =================
    if (!cleanupStarted) {
        cleanupStarted = true;

        console.log("🔁 Starting subscription cleanup loop...");

        setInterval(async () => {
            try {
                await cleanupExpired(client);
            } catch (err) {
                console.log("❌ CLEANUP ERROR:", err.message);
            }
        }, 60 * 60 * 1000); // every 1 hour
    }

    console.log("🚀 All systems initialized successfully");
});