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
require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

// ================= SYSTEM FLAGS =================
let rssStarted = false;
let priceStarted = false;

// ================= READY EVENT =================
client.once("ready", async () => {

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= CONNECT WEBHOOK SYSTEM =================
    attachNowPay(client);
    console.log("💳 NOWPayments webhook connected");

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

    console.log("🚀 All systems initialized successfully");
});