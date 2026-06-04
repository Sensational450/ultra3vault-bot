const { runOrchestrator } = require("../ai/orchestrator");
const { handleMessage } = require("../engagementEngine");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");
const { runMonetizationAI } = require("../aiMonetizationEngine");

// ================= GLOBAL EVENT BUS v2.0 =================

// middleware pipeline (EXTENSIBLE)
const middleware = [];

// ================= REGISTER MIDDLEWARE =================
function use(fn) {
    middleware.push(fn);
}

// ================= CORE EVENT EMITTER =================
async function emitEvent(event, context = {}) {

    try {

        // ================= SAFE NORMALIZATION =================
        event = normalizeEvent(event);

        // ================= RUN MIDDLEWARE PIPELINE =================
        for (const fn of middleware) {
            await fn(event, context);
        }

        // ================= ROUTING LAYER =================
        await routeEvent(event, context);

        console.log("🧠 EVENT BUS v2.0 PROCESSED:", event.type);

    } catch (err) {
        console.log("❌ EVENT BUS ERROR:", err.message);
    }
}

// ================= EVENT NORMALIZER =================
function normalizeEvent(event) {
    return {
        type: event.type || "UNKNOWN",
        userId: event.userId || event.message?.author?.id,
        message: event.message || null,
        user: event.user || null,
        data: event.data || null,
        classification: event.classification || {},
        timestamp: Date.now()
    };
}

// ================= SMART ROUTER =================
async function routeEvent(event, context) {

    const { type, userId } = event;

    // ================= 1. MEMORY LAYER (FIRST) =================
    if (updateFromMessage && type === "MESSAGE") {
        try {
            updateFromMessage(userId, event.message, event.user);
        } catch (e) {
            console.log("MEMORY ERROR:", e.message);
        }
    }

    // ================= 2. ENGAGEMENT ENGINE =================
    if (type === "MESSAGE" && handleMessage) {
        try {
            handleMessage(event.message);
        } catch (e) {
            console.log("ENGAGEMENT ERROR:", e.message);
        }
    }

    // ================= 3. REVENUE TRACKING =================
    if (type === "REVENUE" && trackRevenue) {
        try {
            trackRevenue(event.data);
        } catch (e) {
            console.log("REVENUE ERROR:", e.message);
        }
    }

    // ================= 4. MONETIZATION AI =================
    if (type === "MESSAGE" && runMonetizationAI) {
        try {
            runMonetizationAI(
                event.message,
                event.user,
                {},
                event.message?.channel
            );
        } catch (e) {
            console.log("MONETIZATION AI ERROR:", e.message);
        }
    }

    // ================= 5. ORCHESTRATOR (FINAL DECISION LAYER) =================
    if (runOrchestrator) {
        try {
            await runOrchestrator(event, context);
        } catch (e) {
            console.log("ORCHESTRATOR ERROR:", e.message);
        }
    }
}

// ================= BUILT-IN AI FILTER MIDDLEWARE =================
use((event) => {

    // Example: filter spam-like events
    if (event.type === "MESSAGE" && event.message) {

        const text = event.message.content || "";

        if (text.length > 2000) {
            event.classification.spam = true;
        }
    }
});

// ================= EXPORTS =================
module.exports = {
    emitEvent,
    use
};