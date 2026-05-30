// ================= DEBUG =================
console.log("🧠 STARTUP DEBUG ACTIVE");

process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:");
    console.error(err.stack);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:");
    console.error(err);
});

// ================= LOAD CORE =================
const client = require("./bot/client");
const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceEngine");

const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

let started = false;

client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    // show loaded engine files
    console.log("🔍 LOADED ENGINE FILES:");

    Object.keys(require.cache)
        .filter(file =>
            file.includes("/engine/") ||
            file.includes("\\engine\\")
        )
        .forEach(file => {
            console.log("📦", file);
        });

    attachClient?.(client);

    try {
        await fetchRSS(client);
    } catch (err) {
        console.error("❌ RSS STARTUP ERROR:");
        console.error(err.stack);
    }

    try {
        await fetchPrices(client);
    } catch (err) {
        console.error("❌ PRICE STARTUP ERROR:");
        console.error(err.stack);
    }

    setInterval(async () => {
        try {
            await fetchRSS(client);
        } catch (err) {
            console.error("❌ RSS LOOP ERROR:");
            console.error(err.stack);
        }
    }, 12 * 60 * 1000);

    setInterval(async () => {
        try {
            await fetchPrices(client);
        } catch (err) {
            console.error("❌ PRICE LOOP ERROR:");
            console.error(err.stack);
        }
    }, 90 * 1000);

    setInterval(() => {
        try {
            cleanupExpired(client);
        } catch (err) {
            console.error("❌ CLEANUP ERROR:");
            console.error(err.stack);
        }
    }, 60 * 60 * 1000);

    console.log("🚀 SYSTEM STABLE CORE RUNNING");
});

client.login(process.env.TOKEN);