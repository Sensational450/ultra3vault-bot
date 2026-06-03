const { emitEvent } = require("./eventBus");
const { trackRevenue } = require("./revenueEngine");

// ================= SELF-LEARNING MEMORY =================
const learning = {
    eventSuccess: new Map(), // type → score
    eventRevenue: new Map(), // type → revenue impact
    eventEngagement: new Map()
};

// ================= CACHE =================
const eventCache = new Map();
const CACHE_TTL = 60 * 1000;

// ================= QUEUE =================
const queue = [];
let processing = false;

// ================= MAIN ROUTER =================
async function routeEvent(rawEvent, context = {}) {

    if (!rawEvent) return;

    const event = normalizeEvent(rawEvent);

    const hash = createHash(event);
    if (isDuplicate(hash)) return;
    markSeen(hash);

    // ================= SELF LEARNING SCORE =================
    const baseScore = scoreEvent(event);
    const learnedBoost = getLearningBoost(event.type);

    const finalScore = Math.min(baseScore + learnedBoost, 10);

    event.score = finalScore;

    // ================= FAST PATH =================
    if (finalScore >= 9) {
        console.log("⚡ FAST LEARNED EVENT:", event.type);
        return emitEvent(event, context);
    }

    queue.push({ event, context });

    processQueue();
}

// ================= QUEUE PROCESSOR =================
async function processQueue() {

    if (processing) return;
    processing = true;

    queue.sort((a, b) => (b.event.score || 0) - (a.event.score || 0));

    while (queue.length > 0) {

        const item = queue.shift();

        await emitEvent(item.event, item.context);

        // ================= FEEDBACK LOOP =================
        recordOutcome(item.event);
    }

    processing = false;
}

// ================= STATIC SCORING =================
function scoreEvent(event) {

    let score = 0;

    if (event.type === "MESSAGE") score += 4;
    if (event.type === "RSS") score += 6;
    if (event.type === "REVENUE") score += 10;
    if (event.type === "ALERT") score += 9;

    if (event.priority === "HIGH") score += 3;

    if (event.classification?.value) {
        score += event.classification.value;
    }

    if (event.classification?.risk === "HIGH") {
        score += 2;
    }

    return Math.min(score, 10);
}

// ================= SELF LEARNING BOOST =================
function getLearningBoost(type) {

    const revenue = learning.eventRevenue.get(type) || 0;
    const engagement = learning.eventEngagement.get(type) || 0;

    let boost = 0;

    // Revenue-driven learning
    if (revenue > 100) boost += 2;
    if (revenue > 500) boost += 3;

    // Engagement-driven learning
    if (engagement > 50) boost += 1;
    if (engagement > 200) boost += 2;

    return Math.min(boost, 4);
}

// ================= OUTCOME TRACKING =================
function recordOutcome(event) {

    const type = event.type;

    // track engagement
    const currentEngagement = learning.eventEngagement.get(type) || 0;
    learning.eventEngagement.set(type, currentEngagement + 1);

    // simulate revenue impact learning
    const revenueImpact = estimateRevenue(event);

    const currentRevenue = learning.eventRevenue.get(type) || 0;
    learning.eventRevenue.set(type, currentRevenue + revenueImpact);

    // success score evolution
    const current = learning.eventSuccess.get(type) || 0;
    learning.eventSuccess.set(type, current + event.score * 0.1);
}

// ================= REVENUE ESTIMATOR =================
function estimateRevenue(event) {

    let value = 0;

    if (event.type === "REVENUE") value = 10;
    if (event.type === "MESSAGE") value = 1;
    if (event.type === "RSS") value = 3;
    if (event.type === "ALERT") value = 5;

    if (event.classification?.value > 5) value += 2;

    return value;
}

// ================= DUPLICATION SYSTEM =================
function createHash(event) {
    return `${event.type}_${event.userId}_${event.title?.slice(0, 25)}`;
}

function isDuplicate(hash) {
    const entry = eventCache.get(hash);
    return entry && Date.now() - entry < CACHE_TTL;
}

function markSeen(hash) {
    eventCache.set(hash, Date.now());
}

// ================= EXTERNAL INSIGHT =================
function getLearningReport() {
    return {
        eventSuccess: Object.fromEntries(learning.eventSuccess),
        eventRevenue: Object.fromEntries(learning.eventRevenue),
        eventEngagement: Object.fromEntries(learning.eventEngagement)
    };
}

// ================= EXPORTS =================
module.exports = {
    routeEvent,
    getLearningReport
};