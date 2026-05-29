const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const db = require("../database/premium");

// ================= RSS IMPORT (FIXED) =================
const fetchRSS = require("./rss"); // ✅ FIXED (no destructuring)

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

// ================= CACHE =================
const RSS_CACHE = new Set();

// ================= SYSTEM FLAGS =================
let rssRunning = false;

// ================= READY (FIXED DEPRECATION) =================
client.once("clientReady", (client) => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    console.log("📡 Starting RSS engine...");
    console.log("📊 Starting price alert system...");

    // Prevent double interval
    if (rssRunning) return;
    rssRunning = true;

    setInterval(async () => {
        try {

            // IMPORTANT: fetchRSS already POSTS to Discord
            // so we only call it, no need to re-insert again
            await fetchRSS(client);

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }

    }, 10 * 60 * 1000);
});
