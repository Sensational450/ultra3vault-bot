const { getUserMemory } = require("../userMemoryEngine");

// ================= STRATEGY GENERATOR =================
function generateStrategy(userId, memory) {

    const m = memory || {};

    const strategy = {
        mode: "BALANCED",
        actions: [],
        riskLevel: m.churnRisk || 0,
        monetizationFocus: m.vipLikelihood > 60
    };

    // ================= HIGH VALUE USER =================
    if (m.vipLikelihood > 70) {

        strategy.mode = "REVENUE_MAX";

        strategy.actions.push({
            type: "VIP_OFFER",
            delay: 5000
        });

        strategy.actions.push({
            type: "BOOSTER_OFFER",
            delay: 30000
        });
    }

    // ================= CHURN USER =================
    if (m.churnRisk > 60) {

        strategy.mode = "RECOVERY";

        strategy.actions.push({
            type: "REENGAGE_MESSAGE",
            delay: 10000
        });
    }

    // ================= ACTIVE USER =================
    if (m.engagementScore > 10) {

        strategy.mode = "ENGAGEMENT";

        strategy.actions.push({
            type: "XP_EVENT",
            delay: 15000
        });
    }

    return strategy;
}

module.exports = {
    generateStrategy
};