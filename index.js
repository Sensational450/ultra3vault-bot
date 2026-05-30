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

// ================= LOAD CORE =================
const client = require("./bot/client");
const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceAlerts"); // FIXED (was priceEngine)

const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

// ================= SYSTEM STATE =================
let started = false;
let intervals = [];

// ================= SAFE WRAPPER =================
function safeRun(name, fn) {
    try {
        return fn();
    } catch (err) {
        console.error(`❌ ${name} ERROR:`);
        console.error(err.stack);
    }
}

// ================= STARTUP =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    // ================= ENGINE DEBUG =================
    console.log("🔍 LOADED ENGINE FILES:");

    Object.keys(require.cache)
        .filter(file =>
            file.includes("/engine/") ||
            file.includes("\\engine\\")
        )
        .forEach(file => {
            console.log("📦", file);
        });

    // ================= WEB ATTACH =================
    attachClient?.(client);

    // ================= INITIAL RUN =================
    await safeRun("RSS STARTUP", () => fetchRSS(client));
    await safeRun("PRICE STARTUP", () => fetchPrices(client));

    // ================= INTERVALS =================
    intervals.push(
        setInterval(() => safeRun("RSS LOOP", () => fetchRSS(client)), 12 * 60 * 1000)
    );

    intervals.push(
        setInterval(() => safeRun("PRICE LOOP", () => fetchPrices(client)), 60 * 1000)
    );

    intervals.push(
        setInterval(() => safeRun("CLEANUP LOOP", () => cleanupExpired(client)), 60 * 60 * 1000)
    );

    // ================= HEALTH MONITOR =================
    intervals.push(
        setInterval(() => {
            console.log(`📊 SYSTEM STATUS:
- RSS: ACTIVE
- PRICE: ACTIVE
- MEMORY: ${process.memoryUsage().rss / 1024 / 1024 | 0} MB
- UPTIME: ${Math.floor(process.uptime())}s`);
        }, 5 * 60 * 1000)
    );

    console.log("🚀 SYSTEM STABLE CORE RUNNING (PHASE 4 READY)");
});

// ================= GRACEFUL SHUTDOWN =================
process.on("SIGINT", () => {
    console.log("⚠️ SHUTTING DOWN SYSTEM...");

    intervals.forEach(clearInterval);

    console.log("✅ CLEAN SHUTDOWN COMPLETE");
    process.exit(0);
});

// ================= LOGIN =================
client.login(process.env.TOKEN);