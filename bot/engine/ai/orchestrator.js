const { getUserMemory, updateUserMemory } = require("../engine/userMemoryEngine");

const { generateStrategy } = require("../engine/ai/strategyEngine");
const { predictUserBehavior } = require("../engine/ai/predictEngine");
const { scheduleAction } = require("../engine/ai/actionScheduler");

// ================= ORCHESTRATOR v4.2 =================
async function runOrchestrator(event, context = {}) {

    const memory = await loadMemory(event.userId);

    // ================= STRATEGY =================
    const strategy = generateStrategy(event.userId, memory);

    // ================= PREDICTION =================
    const prediction = predictUserBehavior(memory);

    console.log("🧠 STRATEGY:", strategy.mode);
    console.log("🔮 PREDICTION:", prediction);

    // ================= EXECUTE STRATEGY =================
    executeStrategy(event, strategy, context);

    // ================= UPDATE MEMORY =================
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

    switch (action.type) {

        case "VIP_OFFER":
            context.channel?.send("👑 Upgrade to VIP for 2x XP!");
            break;

        case "BOOSTER_OFFER":
            context.channel?.send("⚡ Boost XP speed now!");
            break;

        case "REENGAGE_MESSAGE":
            context.channel?.send("💔 We miss you! Come back!");
            break;

        case "XP_EVENT":
            context.channel?.send("🔥 Bonus XP event active!");
            break;
    }
}

// ================= MEMORY LEARNING =================
function updateMemory(memory, prediction, userId) {

    updateUserMemory(userId, {
        xpVelocity: prediction.predictedRevenueScore || 0
    });
}

module.exports = {
    runOrchestrator
};