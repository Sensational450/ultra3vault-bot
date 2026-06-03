const { emitEvent } = require("./eventBus");

// ================= MEMORY (optional analytics hook) =================
let eventStats = {
    total: 0,
    highPriority: 0,
    skipped: 0
};

// ================= CACHE (deduplication) =================
const eventCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 min

// ================= PRIORITY QUEUE =================
const queue = [];
let processing = false;

// ================= MAIN ROUTER =================
async function routeEvent(rawEvent, context = {}) {

    try {

        if (!rawEvent) return;

        const event = normalizeEvent(rawEvent);

        // ================= DUPLICATE CHECK =================
        const hash = createHash(event);

        if (isDuplicate(hash)) {
            eventStats.skipped++;
            return;
        }

        markSeen(hash);

        // ================= EVENT SCORING =================
        const score = scoreEvent(event);

        event.score = score;

        eventStats.total++;

        if (score >= 8) eventStats.highPriority++;

        // ================= FAST PATH =================
        if (score >= 9) {
            console.log("⚡ FAST PATH EVENT:", event.type);
            return emitEvent(event, context);
        }

        // ================= QUEUE EVENT =================
        queue.push({ event, context });

        processQueue();

    } catch (err) {
        console.log("❌ ROUTER v2 ERROR:", err.message);
    }
}

// ================= QUEUE PROCESSOR =================
async function processQueue() {

    if (processing) return;
    processing = true;

    // sort by score (highest priority first)
    queue.sort((a, b) => (b.event.score || 0) - (a.event.score || 0));

    while (queue.length > 0) {

        const item = queue.shift();

        try {
            await emitEvent(item.event, item.context);
        } catch (err) {
            console.log("❌ QUEUE EXEC ERROR:", err.message);
        }
    }

    processing = false;
}

// ================= EVENT SCORING ENGINE =================
function scoreEvent(event) {

    let score = 0;

    // TYPE importance
    if (event.type === "MESSAGE") score += 5;
    if (event.type === "REVENUE") score += 9;
    if (event.type === "RSS") score += 7;
    if (event.type === "ALERT") score += 10;

    // CLASSIFICATION VALUE
    if (event.classification?.value) {
        score += event.classification.value;
    }

    // RISK BOOST
    if (event.classification?.risk === "HIGH") {
        score += 2;
    }

    // PRIORITY BOOST
    if (event.priority === "HIGH") {
        score += 3;
    }

    // VIP / MONETIZATION BOOST
    if (event.user?.tier === "VIP") {
        score += 2;
    }

    return Math.min(score, 10);
}

// ================= NORMALIZER =================
function normalizeEvent(rawEvent) {

    return {
        type: rawEvent.type || "UNKNOWN",

        userId: rawEvent.userId || rawEvent.user?.id || null,

        user: rawEvent.user || null,

        message: rawEvent.message || null,

        title: rawEvent.title || rawEvent.message?.content || "",

        content: rawEvent.content || rawEvent.message?.content || "",

        classification: rawEvent.classification || {
            type: "GENERAL",
            sentiment: "NEUTRAL",
            value: 1,
            risk: "LOW"
        },

        priority: rawEvent.priority || "NORMAL",

        source: rawEvent.source || "SYSTEM",

        timestamp: Date.now()
    };
}

// ================= DUPLICATION CONTROL =================
function createHash(event) {
    return `${event.type}_${event.userId}_${event.title?.slice(0, 30)}`;
}

function isDuplicate(hash) {
    const entry = eventCache.get(hash);
    return entry && Date.now() - entry < CACHE_TTL;
}

function markSeen(hash) {
    eventCache.set(hash, Date.now());
}

// ================= ANALYTICS =================
function getEventStats() {
    return {
        ...eventStats,
        queueSize: queue.length,
        cacheSize: eventCache.size
    };
}

// ================= EXPORTS =================
module.exports = {
    routeEvent,
    getEventStats
};