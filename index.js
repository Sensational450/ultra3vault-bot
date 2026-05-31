// ================= STARTUP DEBUG =================
console.log("🧠 STARTUP DEBUG ACTIVE (PHASE 4 CORE)");

// ================= DB DEBUG TRACER =================
const sqlite3 = require("sqlite3").verbose();

const originalDatabase = sqlite3.Database;

sqlite3.Database = function (...args) {
    console.log("🧠 DB OPEN CALLED:", args[0]);
    console.trace("📍 DB CREATED FROM:");
    return new originalDatabase(...args);
};

// ================= ERROR HANDLERS =================
process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:", err.stack || err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:", err?.stack || err);
});

// ================= CORE LOAD =================
const client = require("./bot/client");
const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceEngine");
const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

// ================= STATE =================
let started = false;
let intervals = [];

// ================= SAFE RUNNER =================
async function safeRun(name, fn) {
    try {
        return await fn();
    } catch (err) {
        console.error(`❌ ${name} FAILED:`, err.stack || err);
    }
}

// ================= READY EVENT =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    console.log("🔍 LOADED ENGINE FILES:");
    Object.keys(require.cache)
        .filter(f => f.includes("/engine/") || f.includes("\\engine\\"))
        .forEach(f => console.log("📦", f));

    attachClient?.(client);

    await safeRun("RSS STARTUP", () => fetchRSS(client));
    await safeRun("PRICE STARTUP", () => fetchPrices(client));

    intervals.push(setInterval(() =>
        safeRun("RSS LOOP", () => fetchRSS(client)),
        12 * 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("PRICE LOOP", () => fetchPrices(client)),
        60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("CLEANUP", () => cleanupExpired(client)),
        60 * 60 * 1000
    ));

    console.log("🚀 SYSTEM STABLE CORE RUNNING (PHASE 4 READY)");
});

// ================= SHUTDOWN =================
process.on("SIGINT", () => {
    intervals.forEach(clearInterval);
    console.log("⚠️ SHUTTING DOWN...");
    console.log("✅ CLEAN SHUTDOWN COMPLETE");
    process.exit(0);
});

// ================= LOGIN =================
client.login(process.env.TOKEN);