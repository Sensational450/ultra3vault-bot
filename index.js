const dotenv = require("dotenv");
dotenv.config();

process.on("uncaughtException", err =>
    console.log("💥 CRASH:", err)
);

process.on("unhandledRejection", err =>
    console.log("⚠️ PROMISE ERROR:", err)
);

const client = require("./bot/client");
const fetchRSS = require("./bot/rss");
const fetchPrices = require("./bot/priceAlert");
const { attachClient } = require("./bot/routes/nowpayWebhook");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

require("./web/server");

console.log("🚀 Ultra3Vault system starting...");

let started = false;

let rssInterval;
let priceInterval;
let cleanupInterval;

client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log(`🤖 Bot is online as ${client.user.tag}`);

    // ================= WEBHOOK =================
    attachClient?.(client);

    // ================= RSS ENGINE =================
    console.log("📡 RSS engine starting...");

    await fetchRSS(client).catch(() => {});

    if (rssInterval) clearInterval(rssInterval);

    rssInterval = setInterval(() => {
        fetchRSS(client).catch(() => {});
    }, 15 * 60 * 1000); // 🔥 slower = stable + no spam

    // ================= PRICE ENGINE =================
    console.log("📊 Price system starting...");

    await fetchPrices(client).catch(() => {});

    if (priceInterval) clearInterval(priceInterval);

    priceInterval = setInterval(() => {
        fetchPrices(client).catch(() => {});
    }, 2 * 60 * 1000); // safer for CoinGecko

    // ================= CLEANUP =================
    console.log("🔁 Cleanup loop starting...");

    if (cleanupInterval) clearInterval(cleanupInterval);

    cleanupInterval = setInterval(() => {
        cleanupExpired(client).catch(() => {});
    }, 60 * 60 * 1000);

    console.log("🚀 SYSTEM FULLY STABLE");
});