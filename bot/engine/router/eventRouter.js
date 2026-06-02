const { handleMessage } = require("../engagementEngine");
const { grantVIP } = require("../vipEngine");
const { giveBooster } = require("../boosterEngine");

// ================= AGENT REGISTRY =================
const agents = {};

// ================= REGISTER AGENTS =================
function registerAgent(name, fn) {
    agents[name] = fn;
}

// ================= EVENT SCORING ENGINE =================
function scoreEvent(event) {

    const c = event.classification;

    let score = 0;

    if (c.value) score += c.value;
    if (c.type === "AIR_DROP") score += 5;
    if (c.type === "SECURITY") score += 4;
    if (c.type === "PROJECT") score += 3;
    if (c.sentiment === "POSITIVE") score += 2;

    return score;
}

// ================= AI DECISION ENGINE =================
function decideRouting(event, score) {

    const c = event.classification;

    return {
        engagement: score >= 3,
        monetization: score >= 5,
        alert: c.type === "SECURITY",
        broadcast: score >= 6,
        booster: c.type === "AIR_DROP"
    };
}

// ================= MAIN ROUTER =================
function routeEvent(event) {

    try {

        const score = scoreEvent(event);
        const decision = decideRouting(event, score);

        // ================= LOGIC PIPE =================
        processEvent(event, decision, score);

    } catch (err) {
        console.log("ROUTER ERROR:", err.message);
    }
}

// ================= EVENT PROCESSOR =================
function processEvent(event, decision, score) {

    const c = event.classification;

    // ================= ENGAGEMENT AGENT =================
    if (decision.engagement) {
        agents.engagement?.(event, score);
    }

    // ================= MONETIZATION AGENT =================
    if (decision.monetization) {
        agents.monetization?.(event, score);
    }

    // ================= SECURITY ALERT =================
    if (decision.alert) {
        console.log("⚠️ SECURITY EVENT:", event.title);
    }

    // ================= BOOSTER TRIGGER =================
    if (decision.booster) {
        agents.booster?.(event, score);
    }

    // ================= CONTENT BROADCAST =================
    if (decision.broadcast) {
        agents.broadcast?.(event, score);
    }

    // ================= DEFAULT HANDLING =================
    if (c.type === "GENERAL") {
        console.log("📡 General event processed:", event.title);
    }
}

// ================= DEFAULT AGENTS =================

// Engagement Agent
registerAgent("engagement", (event, score) => {
    console.log("🎯 Engagement Agent triggered");
});

// Monetization Agent
registerAgent("monetization", (event, score) => {
    console.log("💰 Monetization Agent triggered");
});

// Booster Agent
registerAgent("booster", (event, score) => {
    console.log("⚡ Booster opportunity detected");
});

// Broadcast Agent
registerAgent("broadcast", (event, score) => {
    console.log("📢 Broadcast event:", event.title);
});

// ================= EXPORT =================
module.exports = {
    routeEvent,
    registerAgent
};