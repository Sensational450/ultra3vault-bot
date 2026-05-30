// ================= DEBUG SYSTEM =================
console.log("🧠 STARTUP DEBUG ACTIVE (PHASE 4 CORE)");

process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:");
    console.error(err.stack || err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:");
    console.error(err?.stack || err);
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
        console.error(`❌ ${name} FAILED:`);
        console.error(err.stack || err);
    }
}

// ================= READY EVENT =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    // ================= ENGINE DEBUG =================
    console.log("🔍 LOADED ENGINE FILES:");

    Object.keys(require.cache)
        .filter(f => f.includes("/engine/") || f.includes("\\engine\\"))
        .forEach(f => console.log("📦", f));

    // ================= WEB ATTACH =================
    attachClient?.(client);

    // ================= FIRST RUN =================
    await safeRun("RSS STARTUP", () => fetchRSS(client));
    await safeRun("PRICE STARTUP", () => fetchPrices(client));

    // ================= INTERVALS =================
    intervals.push(setInterval(() =>
        safeRun("RSS LOOP", () => fetchRSS(client)), 12 * 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("PRICE LOOP", () => fetchPrices(client)), 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("CLEANUP LOOP", () => cleanupExpired(client)), 60 * 60 * 1000
    ));

    // ================= HEALTH MONITOR =================
    intervals.push(setInterval(() => {
        console.log(`📊 SYSTEM STATUS:
RSS: ACTIVE
PRICE: ACTIVE
MEMORY: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
UPTIME: ${Math.floor(process.uptime())}s`);
    }, 5 * 60 * 1000));

    console.log("🚀 SYSTEM STABLE CORE RUNNING (PHASE 4 READY)");
});

// ================= SHUTDOWN =================
process.on("SIGINT", () => {
    console.log("⚠️ SHUTTING DOWN...");

    intervals.forEach(clearInterval);

    console.log("✅ CLEAN SHUTDOWN COMPLETE");
    process.exit(0);
});

// ================= LOGIN =================
client.login(process.env.TOKEN);