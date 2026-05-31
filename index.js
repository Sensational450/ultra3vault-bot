console.log("🧠 STARTUP DEBUG ACTIVE (PHASE 4 CORE)");

process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:", err.stack || err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:", err?.stack || err);
});

const client = require("./bot/client");
const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceEngine");
const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

let started = false;
let intervals = [];

async function safeRun(name, fn) {
    try {
        return await fn();
    } catch (err) {
        console.error(`❌ ${name} FAILED:`, err);
    }
}

client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    attachClient?.(client);

    await safeRun("RSS STARTUP", () => fetchRSS(client));
    await safeRun("PRICE STARTUP", () => fetchPrices(client));

    intervals.push(setInterval(() =>
        safeRun("RSS LOOP", () => fetchRSS(client)), 12 * 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("PRICE LOOP", () => fetchPrices(client)), 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("CLEANUP", () => cleanupExpired(client)), 60 * 60 * 1000
    ));

    console.log("🚀 SYSTEM STABLE CORE RUNNING (PHASE 4 READY)");
});

process.on("SIGINT", () => {
    intervals.forEach(clearInterval);
    console.log("✅ CLEAN SHUTDOWN COMPLETE");
    process.exit(0);
});

client.login(process.env.TOKEN);