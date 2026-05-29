const { Client, GatewayIntentBits } = require("discord.js");
const db = require("../database/premium");

// ================= IMPORT SYSTEMS =================
const fetchRSS = require("./rss");
const fetchPrices = require("./priceAlert");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= SYSTEM STATE =================
let rssRunning = false;
let priceRunning = false;

// ================= READY EVENT (FIXED) =================
client.once("ready", async () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    console.log("📡 Starting RSS engine...");
    console.log("📊 Starting price alert system...");

    // ================= RSS ENGINE =================
    if (!rssRunning) {
        rssRunning = true;

        setInterval(async () => {
            try {
                await fetchRSS(client);
            } catch (err) {
                console.log("❌ RSS ERROR:", err.message);
            }
        }, 10 * 60 * 1000);
    }

    // ================= PRICE ALERT ENGINE =================
    if (!priceRunning) {
        priceRunning = true;

        setInterval(async () => {
            try {
                await fetchPrices(client);
            } catch (err) {
                console.log("❌ PRICE ALERT ERROR:", err.message);
            }
        }, 60 * 1000); // every 1 min
    }

    console.log("🚀 All systems initialized");
});
