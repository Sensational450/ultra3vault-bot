const { getUserMemory, updateUserMemory } = require("../engine/userMemoryEngine");

// ================= IMPORT AGENTS =================
const agents = {
    rss: require("../agents/rssAgent"),
    engagement: require("../agents/engagementAgent"),
    monetization: require("../agents/monetizationAgent"),
    memory: require("../agents/memoryAgent"),
    risk: require("../agents/riskAgent")
};

// ================= SELF-LEARNING WEIGHTS =================
const weights = {
    engagement: 1.0,
    monetization: 1.0,
    risk: 1.0,
    rss: 1.0
};

// ================= MAIN ORCHESTRATOR =================
async function runOrchestrator(event, context = {}) {

    const memory = await loadMemory(event.userId);

    const votes = await collectVotes(event, memory, context);

    const decision = resolveDecision(votes);

    executeDecision(event, decision, context);

    learnFromOutcome(event, decision, memory);
}

// ================= MEMORY =================
function loadMemory(userId) {
    return new Promise((resolve) => {
        if (!userId) return resolve(null);
        getUserMemory(userId, (data) => resolve(data || {}));
    });
}

// ================= COLLECT AGENT VOTES =================
async function collectVotes(event, memory, context) {

    const results = [];

    for (const [name, agent] of Object.entries(agents)) {

        if (!agent?.vote) continue;

        try {
            const res = await agent.vote(event, { memory, context });

            results.push({
                agent: name,
                ...res,
                weightedScore: (res.vote || 0) * (weights[name] || 1)
            });

        } catch (err) {
            console.log(`⚠️ Agent error (${name}):`, err.message);
        }
    }

    return results;
}

// ================= DECISION ENGINE =================
function resolveDecision(votes) {

    let best = null;
    let highest = -Infinity;

    for (const v of votes) {

        if (v.weightedScore > highest) {
            highest = v.weightedScore;
            best = v;
        }
    }

    return best || {
        action: "IGNORE",
        vote: 0
    };
}

// ================= EXECUTION LAYER =================
function executeDecision(event, decision, context) {

    if (!decision) return;

    console.log("🧠 FINAL DECISION:", decision.action);

    if (decision.action === "ENGAGE") {
        agents.engagement?.handle(event, context);
    }

    if (decision.action === "MONETIZE") {
        agents.monetization?.handle(event, context);
    }

    if (decision.action === "RISK") {
        agents.risk?.handle(event, context);
    }

    if (decision.action === "RSS") {
        agents.rss?.handle(event, context);
    }
}

// ================= SELF-LEARNING LOOP =================
function learnFromOutcome(event, decision, memory) {

    if (!memory) return;

    let update = {};

    // simple reinforcement learning

    if (decision.action === "MONETIZE") {
        update.monetizationScore = (memory.monetizationScore || 0) + 1;
    }

    if (decision.action === "ENGAGE") {
        update.engagementScore = (memory.engagementScore || 0) + 1;
    }

    if (decision.action === "RISK") {
        update.churnRisk = Math.max((memory.churnRisk || 0) - 1, 0);
    }

    updateUserMemory(event.userId, update);
}

module.exports = {
    runOrchestrator
};