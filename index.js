console.log("🧠 ULTRA3 AI SYSTEM BOOTING (v5 CORE)");

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

// 🧠 AI ORCHESTRATOR (CORE BRAIN)
const { runOrchestrator } = require("./bot/engine/ai/orchestrator");

// 🧠 EVENT BUS (OPTIONAL FUTURE LAYER)
let emitEvent = null;
try {
    ({ emitEvent } = require("./bot/engine/ai/eventBus"));
} catch (e) {
    console.log("⚠️ EventBus not loaded (safe mode)");
}

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

// ================= AI PIPELINE ROUTER =================
function routeToAI(event) {

    try {

        // 1. Orchestrator (PRIMARY BRAIN)
        if (runOrchestrator) {
            runOrchestrator(event, { client });
        }

        // 2. Event Bus (MULTI-AGENT SYSTEM)
        if (emitEvent) {
            emitEvent(event, { client });
        }

    } catch (err) {
        console.error("❌ AI ROUTER ERROR:", err.message);
    }
}

// ================= WRAPPED ENGINE CALLS =================
async function runRSS() {

    const data = await fetchRSS(client);

    // If RSS returns events → send to AI
    if (Array.isArray(data)) {
        data.forEach(event => routeToAI(event));
    }
}

async function runPrices() {

    const data = await fetchPrices(client);

    if (Array.isArray(data)) {
        data.forEach(event => routeToAI(event));
    }
}

// ================= READY =================
client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);
    console.log("🚀 AI SYSTEM v5 ACTIVE");

    attachClient?.(client);

    // ================= INITIAL RUN =================
    await safeRun("RSS INIT", runRSS);
    await safeRun("PRICE INIT", runPrices);

    // ================= LOOPS =================
    intervals.push(setInterval(() =>
        safeRun("RSS LOOP", runRSS),
        12 * 60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("PRICE LOOP", runPrices),
        60 * 1000
    ));

    intervals.push(setInterval(() =>
        safeRun("CLEANUP", () => cleanupExpired(client)),
        60 * 60 * 1000
    ));

    console.log("🚀 SYSTEM FULLY CONNECTED (AI PIPELINE ACTIVE)");
});

// ================= LOGIN =================
client.login(process.env.TOKEN);