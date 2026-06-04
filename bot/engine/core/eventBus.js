const { runOrchestrator } = require("../ai/orchestrator");
const { handleMessage } = require("../engagementEngine");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");
const { runMonetizationAI } = require("../aiMonetizationEngine");

// ================= SELF-LEARNING STATE =================
const agentScores = {
    memory: 1,
    engagement: 1,
    revenue: 1,
    monetization: 1,
    orchestrator: 1
};

// event performance history
const eventHistory = [];

// middleware system
const middleware = [];

// ================= REGISTER MIDDLEWARE =================
function use(fn) {
    middleware.push(fn);
}

// ================= EVENT EMITTER =================
async function emitEvent(event, context = {}) {

    try {

        event = normalizeEvent(event);

        // ================= PRE-MIDDLEWARE =================
        for (const fn of middleware) {
            await fn(event, context);
        }

        // ================= CORE ROUTING =================
        await routeEvent(event, context);

        // ================= LEARNING STEP =================
        learnFromEvent(event);

        console.log("🧠 EVENT BUS v3 PROCESSED:", event.type);

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

// ================= SMART ADAPTIVE ROUTER =================
async function routeEvent(event, context) {

    const weight = getRoutingWeights();

    // ================= MEMORY LAYER =================
    if (updateFromMessage && event.type === "MESSAGE") {
        safeExecute("memory", () =>
            updateFromMessage(event.userId, event.message, event.user)
        );
    }

    // ================= ENGAGEMENT =================
    if (event.type === "MESSAGE" && handleMessage) {
        safeExecute("engagement", () =>
            handleMessage(event.message)
        );
    }

    // ================= REVENUE =================
    if (event.type === "REVENUE") {
        safeExecute("revenue", () =>
            trackRevenue(event.data)
        );
    }

    // ================= MONETIZATION AI =================
    if (event.type === "MESSAGE" && runMonetizationAI) {
        safeExecute("monetization", () =>
            runMonetizationAI(
                event.message,
                event.user,
                {},
                event.message?.channel
            )
        );
    }

    // ================= ORCHESTRATOR (ADAPTIVE PRIORITY) =================
    if (runOrchestrator) {

        const delay = Math.floor(1000 / weight.orchestrator);

        setTimeout(() => {
            safeExecute("orchestrator", () =>
                runOrchestrator(event, context)
            );
        }, delay);
    }
}

// ================= SAFE EXECUTION WRAPPER =================
function safeExecute(agent, fn) {

    const start = Date.now();

    try {
        const result = fn();
        updateAgentScore(agent, true, Date.now() - start);
        return result;
    } catch (err) {
        updateAgentScore(agent, false, Date.now() - start);
        console.log(`❌ AGENT ERROR [${agent}]:`, err.message);
    }
}

// ================= ADAPTIVE WEIGHT SYSTEM =================
function getRoutingWeights() {

    const total = Object.values(agentScores)
        .reduce((a, b) => a + b, 0);

    return {
        orchestrator: agentScores.orchestrator / total,
        engagement: agentScores.engagement / total,
        memory: agentScores.memory / total,
        revenue: agentScores.revenue / total,
        monetization: agentScores.monetization / total
    };
}

// ================= SELF-LEARNING ENGINE =================
function learnFromEvent(event) {

    eventHistory.push({
        type: event.type,
        timestamp: event.timestamp
    });

    // keep memory bounded
    if (eventHistory.length > 500) {
        eventHistory.shift();
    }

    const recent = eventHistory.slice(-50);

    const messageEvents = recent.filter(e => e.type === "MESSAGE").length;
    const revenueEvents = recent.filter(e => e.type === "REVENUE").length;

    // ================= DYNAMIC ADJUSTMENT =================

    if (revenueEvents > messageEvents * 0.3) {
        agentScores.revenue += 0.2;
        agentScores.monetization += 0.1;
    } else {
        agentScores.engagement += 0.1;
    }

    if (messageEvents > 30) {
        agentScores.memory += 0.05;
    }
}

// ================= AGENT PERFORMANCE TRACKER =================
function updateAgentScore(agent, success, latency) {

    if (!agentScores[agent]) agentScores[agent] = 1;

    if (success) {
        agentScores[agent] += 0.1;
    } else {
        agentScores[agent] -= 0.2;
    }

    if (latency > 500) {
        agentScores[agent] -= 0.05;
    }

    // clamp
    agentScores[agent] = Math.max(0.1, agentScores[agent]);
}

// ================= EXPORTS =================
module.exports = {
    emitEvent,
    use
};