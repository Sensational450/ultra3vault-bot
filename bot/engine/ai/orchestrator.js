const { getUserMemory } = require("../engine/userMemoryEngine");

// ================= AGENT REGISTRY =================
const agents = {};

// ================= ORCHESTRATOR =================
async function runOrchestrator(event, context = {}) {

    const memory = await getMemory(event.userId);

    const decision = await makeDecision(event, memory);

    executeAgents(event, decision, context);
}

// ================= MEMORY LOADER =================
function getMemory(userId) {
    return new Promise((resolve) => {
        if (!userId) return resolve(null);
        getUserMemory(userId, (data) => resolve(data));
    });
}

// ================= AI DECISION ENGINE =================
async function makeDecision(event, memory) {

    const score = {
        engagement: memory?.engagementScore || 0,
        monetization: memory?.monetizationScore || 0,
        vip: memory?.vipLikelihood || 0,
        churn: memory?.churnRisk || 0
    };

    return {
        engagement: score.engagement > 5,
        monetization: score.monetization > 3,
        memoryUpdate: true,
        rss: event.type === "RSS",
        risk: score.churn > 60,
        broadcast: event.priority === "HIGH"
    };
}

// ================= EXECUTION LAYER =================
function executeAgents(event, decision, context) {

    if (decision.engagement) {
        agents.engagement?.(event, context);
    }

    if (decision.monetization) {
        agents.monetization?.(event, context);
    }

    if (decision.memoryUpdate) {
        agents.memory?.(event, context);
    }

    if (decision.rss) {
        agents.rss?.(event, context);
    }

    if (decision.risk) {
        agents.risk?.(event, context);
    }

    if (decision.broadcast) {
        agents.broadcast?.(event, context);
    }
}

// ================= REGISTER AGENTS =================
function registerAgent(name, fn) {
    agents[name] = fn;
}

module.exports = {
    runOrchestrator,
    registerAgent
};