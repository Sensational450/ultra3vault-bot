const { getUserMemory, updateUserMemory } = require("../engine/userMemoryEngine");

const { generateStrategy } = require("../engine/ai/strategyEngine");
const { predictUserBehavior } = require("../engine/ai/predictEngine");
const { scheduleAction } = require("../engine/ai/actionScheduler");

// 🧠 NEW: CONTENT GENERATOR
const { generateContent } = require("../engine/ai/contentGenerator");

// ================= ORCHESTRATOR v4.3 =================
async function runOrchestrator(event, context = {}) {

    const memory = await loadMemory(event.userId);

    event.memory = memory; // 🔥 pass memory to agents

    // ================= STRATEGY =================
    const strategy = generateStrategy(event.userId, memory);

    // ================= PREDICTION =================
    const prediction = predictUserBehavior(memory);

    console.log("🧠 STRATEGY:", strategy.mode);
    console.log("🔮 PREDICTION:", prediction);

    // ================= AI CONTENT PRE-GENERATION =================
    if (strategy.mode === "MONETIZE") {

        const aiOffer = await generateContent({
            type: "VIP_OFFER",
            user: memory,
            event,
            tone: "persuasive"
        });

        event.aiOffer = aiOffer;
    }

    // ================= EXECUTE STRATEGY =================
    executeStrategy(event, strategy, context);

    // ================= MEMORY UPDATE =================
    updateMemory(memory, prediction, event.userId);
}

// ================= MEMORY =================
function loadMemory(userId) {
    return new Promise((resolve) => {
        getUserMemory(userId, (data) => resolve(data || {}));
    });
}

// ================= STRATEGY EXECUTION =================
function executeStrategy(event, strategy, context) {

    for (const action of strategy.actions) {

        scheduleAction(
            event.userId,
            action,
            action.delay,
            (a) => executeAction(event, a, context)
        );
    }
}

// ================= ACTION EXECUTOR =================
function executeAction(event, action, context) {

    console.log("⚡ EXECUTING:", action.type);

    const channel = context.channel;

    switch (action.type) {

        case "VIP_OFFER":
            channel?.send(event.aiOffer || "👑 Upgrade to VIP for 2x XP!");
            break;

        case "BOOSTER_OFFER":
            channel?.send("⚡ Boost XP speed now!");
            break;

        case "REENGAGE_MESSAGE":
            channel?.send("💔 We miss you! Come back!");
            break;

        case "XP_EVENT":
            channel?.send("🔥 Bonus XP event active!");
            break;
    }
}

// ================= MEMORY LEARNING =================
function updateMemory(memory, prediction, userId) {

    updateUserMemory(userId, {
        xpVelocity: prediction.predictedRevenueScore || 0,
        activityScore: (memory.activityScore || 0) + 1
    });
}

module.exports = {
    runOrchestrator
};