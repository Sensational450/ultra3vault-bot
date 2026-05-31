console.log("🧠 STARTUP DEBUG ACTIVE (PHASE 4 CORE)");

// ================= ERROR HANDLERS =================
process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:");
    console.error(err?.stack || err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:");
    console.error(err?.stack || err);
});

// ================= CORE IMPORTS =================
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
        console.log(`⚙️ Running: ${name}`);
        return await fn();
    } catch (err) {
        console.error(`❌ ${name} FAILED:`);
        console.error(err?.stack || err);
    }
}

// ================= READY EVENT =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);
    console.log("📡 SYSTEM INITIALIZING...");

    attachClient?.(client);

    // ================= ENGINE START =================
    await safeRun("RSS STARTUP", () => fetchRSS(client));
    await safeRun("PRICE STARTUP", () => fetchPrices(client));

    // ================= LOOPS =================
    intervals.push(setInterval(() =>
        safeRun("RSS LOOP", () => fetchRSS(client)),
        12 * 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("PRICE LOOP", () => fetchPrices(client)),
        60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("CLEANUP LOOP", () => cleanupExpired(client)),
        60 * 60 * 1000
    ));

    // ================= HEALTH CHECK =================
    intervals.push(setInterval(() => {
        console.log(`📊 HEALTH CHECK:
Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB
Uptime: ${Math.floor(process.uptime())}s
Status: ACTIVE`);
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