const { runOrchestrator } = require("../ai/orchestrator");
const { handleMessage } = require("../engagementEngine");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");
const { runMonetizationAI } = require("../aiMonetizationEngine");

// ================= SELF-ADAPTIVE STATE =================
const agentScore = new Map();
const eventScore = new Map();
const pipelineMemory = [];

// ================= EVENT PRIORITY WEIGHTS =================
const eventWeights = {
    MESSAGE: 1,
    RSS: 1,
    REVENUE: 2,
    SYSTEM: 0.5
};

// ================= MAIN EMITTER =================
async function emitEvent(event, context = {}) {

    const normalized = normalize(event);

    recordEvent(normalized);

    const priority = getEventPriority(normalized);

    // ================= DYNAMIC ROUTING ORDER =================
    const pipeline = buildPipeline(normalized, priority);

    for (const step of pipeline) {
        await executeStep(step, normalized, context);
    }

    learn(normalized, pipeline);
}

// ================= NORMALIZER =================
function normalize(event) {
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

// ================= PIPELINE BUILDER =================
function buildPipeline(event, priority) {

    const base = [];

    if (updateFromMessage && event.type === "MESSAGE") {
        base.push({ name: "memory", fn: updateFromMessage });
    }

    if (handleMessage && event.type === "MESSAGE") {
        base.push({ name: "engagement", fn: handleMessage });
    }

    if (runMonetizationAI && event.type === "MESSAGE") {
        base.push({ name: "monetization", fn: runMonetizationAI });
    }

    if (runOrchestrator) {
        base.push({ name: "orchestrator", fn: runOrchestrator });
    }

    // SORT BY PERFORMANCE SCORE
    return base.sort((a, b) =>
        (agentScore.get(b.name) || 1) - (agentScore.get(a.name) || 1)
    );
}

// ================= EXECUTION ENGINE =================
async function executeStep(step, event, context) {

    const start = Date.now();

    try {

        if (step.name === "memory") {
            step.fn(event.userId, event.message, event.user);
        }

        else if (step.name === "engagement") {
            step.fn(event.message);
        }

        else if (step.name === "monetization") {
            step.fn(event.message, event.user, {}, event.message?.channel);
        }

        else if (step.name === "orchestrator") {
            step.fn(event, context);
        }

        updateScore(step.name, true, Date.now() - start);

    } catch (err) {
        updateScore(step.name, false, Date.now() - start);
    }
}

// ================= LEARNING ENGINE =================
function learn(event, pipeline) {

    pipelineMemory.push({
        type: event.type,
        pipeline: pipeline.map(p => p.name)
    });

    if (pipelineMemory.length > 300) pipelineMemory.shift();

    const recent = pipelineMemory.slice(-50);

    const successBias = recent.length / (pipeline.length || 1);

    if (successBias > 2) {
        boostAllAgents(0.05);
    }
}

// ================= SCORE SYSTEM =================
function updateScore(name, success, latency) {

    const score = agentScore.get(name) || 1;

    if (success) agentScore.set(name, score + 0.1);
    else agentScore.set(name, score - 0.2);

    if (latency > 400) {
        agentScore.set(name, score - 0.05);
    }

    agentScore.set(name, Math.max(0.1, agentScore.get(name)));
}

// ================= GLOBAL BOOST =================
function boostAllAgents(val) {
    for (const [k, v] of agentScore) {
        agentScore.set(k, v + val);
    }
}

// ================= PRIORITY =================
function getEventPriority(event) {
    return eventWeights[event.type] || 1;
}

// ================= TRACK =================
function recordEvent(event) {
    eventScore.set(event.type,
        (eventScore.get(event.type) || 0) + 1
    );
}

module.exports = { emitEvent };