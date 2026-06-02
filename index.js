console.log("🧠 ULTRA3 AI SYSTEM BOOTING (v5 CORE)");

// ================= ERROR HANDLERS =================
process.on("uncaughtException", (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:", err?.stack || err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 UNHANDLED REJECTION:", err?.stack || err);
});

// ================= CORE IMPORTS =================
const client = require("./bot/client");

const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceEngine");

const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

// 🧠 NEW: ORCHESTRATOR (IMPORTANT CONNECTION)
const { runOrchestrator } = require("./bot/engine/ai/orchestrator");

// ================= STATE =================
let started = false;
let intervals = [];

// ================= SAFE RUNNER =================
async function safeRun(name, fn) {
    try {
        console.log(`⚙️ Running: ${name}`);
        return await fn();
    } catch (err) {
        console.error(`❌ ${name} FAILED:`, err?.stack || err);
    }
}

// ================= READY =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);
    console.log("🚀 AI SYSTEM v5 ACTIVE");

    attachClient?.(client);

    // ================= RSS ENGINE =================
    await safeRun("RSS INIT", () => fetchRSS(client));

    // ================= PRICE ENGINE =================
    await safeRun("PRICE INIT", () => fetchPrices(client));

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
        safeRun("CLEANUP", () => cleanupExpired(client)),
        60 * 60 * 1000
    ));

    console.log("🚀 SYSTEM FULLY CONNECTED (v5 ACTIVE)");
});

// ================= GLOBAL EVENT PIPELINE =================
// THIS IS THE MOST IMPORTANT CONNECTION YOU WERE MISSING
function routeToAI(event) {

    if (!runOrchestrator) return;

    runOrchestrator(event, {
        client
    });
}

// ================= LOGIN =================
client.login(process.env.TOKEN);