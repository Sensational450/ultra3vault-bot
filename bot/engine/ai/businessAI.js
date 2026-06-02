const { getUserMemory, updateUserMemory } = require("../userMemoryEngine");

// ================= BUSINESS AI CORE =================
async function runBusinessAI(event, context = {}) {

    const memory = await loadMemory(event.userId);

    const insights = calculateBusinessInsights(memory);

    const strategy = generateBusinessStrategy(insights);

    executeBusinessActions(event, strategy, context);

    selfOptimize(memory, insights, event.userId);
}

// ================= MEMORY =================
function loadMemory(userId) {

    return new Promise((resolve) => {
        getUserMemory(userId, (data) => resolve(data || {}));
    });
}

// ================= BUSINESS INTELLIGENCE =================
function calculateBusinessInsights(m) {

    return {

        ltv: (m.vipLikelihood || 0) * (m.engagementScore || 1),

        churnRisk: m.churnRisk || 0,

        conversionScore:
            (m.engagementScore * 0.4) +
            (m.monetizationScore * 0.6),

        growthPotential:
            (m.activityScore + m.engagementScore) / 2
    };
}

// ================= STRATEGY ENGINE =================
function generateBusinessStrategy(i) {

    const strategy = {
        revenueMode: "BALANCED",
        actions: []
    };

    // 💰 HIGH VALUE USER
    if (i.ltv > 70 && i.churnRisk < 40) {

        strategy.revenueMode = "MAXIMUM_REVENUE";

        strategy.actions.push({
            type: "VIP_UPSELL",
            priority: "HIGH"
        });

        strategy.actions.push({
            type: "BOOSTER_BUNDLE",
            priority: "MEDIUM"
        });
    }

    // 📉 RISK USER
    if (i.churnRisk > 60) {

        strategy.revenueMode = "RETENTION_MODE";

        strategy.actions.push({
            type: "RETENTION_OFFER"
        });
    }

    // 📈 GROWTH USER
    if (i.growthPotential > 10) {

        strategy.revenueMode = "GROWTH_MODE";

        strategy.actions.push({
            type: "ENGAGEMENT_EVENT"
        });
    }

    return strategy;
}

// ================= EXECUTION =================
function executeBusinessActions(event, strategy, context) {

    for (const action of strategy.actions) {

        switch (action.type) {

            case "VIP_UPSELL":
                context.channel?.send("👑 VIP unlock boosts XP + ranking!");
                break;

            case "BOOSTER_BUNDLE":
                context.channel?.send("⚡ Limited booster bundle available!");
                break;

            case "RETENTION_OFFER":
                context.channel?.send("💔 We want you back — special reward available!");
                break;

            case "ENGAGEMENT_EVENT":
                context.channel?.send("🔥 Bonus XP event started!");
                break;
        }
    }
}

// ================= SELF-OPTIMIZATION LOOP =================
function selfOptimize(memory, insights, userId) {

    updateUserMemory(userId, {
        xpVelocity: insights.conversionScore,
        monetizationScore: insights.ltv,
        churnRisk: insights.churnRisk
    });
}

module.exports = {
    runBusinessAI
};