const { getUserMemory } = require("../engine/userMemoryEngine");

// ================= IMPORT AGENTS =================
const rssAgent = require("../agents/rssAgent");
const engagementAgent = require("../agents/engagementAgent");
const monetizationAgent = require("../agents/monetizationAgent");
const memoryAgent = require("../agents/memoryAgent");
const riskAgent = require("../agents/riskAgent");

// ================= ORCHESTRATOR CORE =================
async function runOrchestrator(event, context = {}) {

    try {

        const memory = await getMemory(event.userId);

        const enrichedContext = {
            ...context,
            memory,
            isActive: context.isActive || false,
            spamDetected: context.spamDetected || false
        };

        const decision = await makeDecision(event, memory);

        executeAgents(event, decision, enrichedContext);

    } catch (err) {
        console.log("❌ ORCHESTRATOR ERROR:", err.message);
    }
}

// ================= MEMORY LOADER =================
function getMemory(userId) {

    return new Promise((resolve) => {

        if (!userId) return resolve(null);

        getUserMemory(userId, (data) => {
            resolve(data || null);
        });
    });
}

// ================= AI DECISION ENGINE (IMPROVED v4.0) =================
async function makeDecision(event, memory) {

    const m = memory || {};

    const engagement = m.engagementScore || 0;
    const monetization = m.monetizationScore || 0;
    const vip = m.vipLikelihood || 0;
    const churn = m.churnRisk || 0;

    // ================= INTELLIGENCE SCORE =================
    const intelligenceScore =
        (engagement * 0.4) +
        (monetization * 0.3) +
        (vip * 0.2) -
        (churn * 0.5);

    return {
        engagement: engagement > 5 || event.type === "MESSAGE",
        monetization: monetization > 3 || vip > 60,
        memoryUpdate: true,
        rss: event.type === "RSS",
        risk: churn > 60,
        broadcast: event.priority === "HIGH",

        // NEW v4.0 SIGNAL
        highValueUser: intelligenceScore > 25,
        lowValueUser: intelligenceScore < 5
    };
}

// ================= EXECUTION LAYER =================
function executeAgents(event, decision, context) {

    // ================= MEMORY AGENT (ALWAYS RUN) =================
    memoryAgent?.handle(event, context);

    // ================= RSS =================
    if (decision.rss) {
        rssAgent?.handle(event, context);
    }

    // ================= ENGAGEMENT =================
    if (decision.engagement) {
        engagementAgent?.handle(event, context);
    }

    // ================= MONETIZATION =================
    if (decision.monetization) {
        monetizationAgent?.handle(event, context);
    }

    // ================= RISK SYSTEM =================
    if (decision.risk) {
        riskAgent?.handle(event, context);
    }

    // ================= HIGH VALUE USER BOOST =================
    if (decision.highValueUser) {
        monetizationAgent?.handle(event, {
            ...context,
            mode: "VIP_PRIORITY"
        });
    }

    // ================= LOW VALUE USER RECOVERY =================
    if (decision.lowValueUser) {
        riskAgent?.handle(event, {
            ...context,
            mode: "RECOVERY"
        });
    }

    // ================= BROADCAST SYSTEM =================
    if (decision.broadcast) {
        console.log("📢 BROADCAST EVENT:", event.type);
    }
}

module.exports = {
    runOrchestrator
};