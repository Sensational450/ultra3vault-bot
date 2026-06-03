const { emitEvent } = require("./eventBus");

// ================= EVENT ROUTER v1.0 =================
// Central entry point that converts raw system signals
// into structured AI events

async function routeEvent(rawEvent, context = {}) {

    try {

        if (!rawEvent) return;

        // ================= NORMALIZE EVENT =================
        const event = normalizeEvent(rawEvent);

        // ================= BASIC VALIDATION =================
        if (!event.type) {
            console.log("⚠️ Invalid event: missing type");
            return;
        }

        // ================= ATTACH CONTEXT =================
        event.context = context;

        // ================= DEBUG LOG =================
        console.log("📡 ROUTING EVENT:", event.type);

        // ================= SEND TO EVENT BUS =================
        await emitEvent(event, context);

    } catch (err) {
        console.log("❌ EVENT ROUTER ERROR:", err.message);
    }
}

// ================= EVENT NORMALIZER =================
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

// ================= EVENT BUILDERS (HELPERS) =================

// MESSAGE EVENT
function createMessageEvent(message) {
    return {
        type: "MESSAGE",
        userId: message.author.id,
        user: message.author,
        message,
        source: "DISCORD"
    };
}

// REVENUE EVENT
function createRevenueEvent(data) {
    return {
        type: "REVENUE",
        userId: data.userId,
        data,
        source: "PAYMENT_SYSTEM"
    };
}

// RSS EVENT
function createRssEvent(item) {
    return {
        type: "RSS",
        title: item.title,
        content: item.content,
        link: item.link,
        source: "RSS_ENGINE"
    };
}

// ALERT EVENT
function createAlertEvent(alert) {
    return {
        type: "ALERT",
        title: alert.title,
        content: alert.content,
        priority: "HIGH",
        source: "SYSTEM_ALERT"
    };
}

// ================= EXPORTS =================
module.exports = {
    routeEvent,

    // helpers (IMPORTANT for future scaling)
    createMessageEvent,
    createRevenueEvent,
    createRssEvent,
    createAlertEvent
};