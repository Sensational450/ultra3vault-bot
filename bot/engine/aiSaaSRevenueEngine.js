const { getVIP } = require("./vipEngine");
const { getBooster } = require("./boosterEngine");

// ================= USER VALUE ENGINE =================
function calculateUserValue(user) {

    const activityScore =
        user.level * 5 +
        user.messages * 0.2 +
        user.invites * 10;

    const xpScore = user.xp * 0.01;

    return activityScore + xpScore;
}

// ================= CHURN RISK ENGINE =================
function getChurnRisk(lastActive, level) {

    const now = Date.now();
    const inactiveTime = now - lastActive;

    let risk = 0;

    if (inactiveTime > 86400000) risk += 40; // 1 day
    if (inactiveTime > 259200000) risk += 30; // 3 days
    if (level < 5) risk += 20;

    return Math.min(risk, 100);
}

// ================= DYNAMIC PRICING ENGINE =================
function getDynamicPrice(basePrice, userValue) {

    if (userValue > 500) return basePrice * 1.5;
    if (userValue < 100) return basePrice * 0.8;

    return basePrice;
}

// ================= AI MONETIZATION DECISION =================
function getOffer(user, lastActive) {

    const value = calculateUserValue(user);
    const churn = getChurnRisk(lastActive, user.level);

    // ================= HIGH VALUE USER =================
    if (value > 800 && !user.vip) {
        return {
            type: "VIP_PREMIUM",
            message:
`💎 Exclusive VIP offer unlocked!

You're a high-value user — upgrade now for 2x XP + perks.`,
            discount: 0
        };
    }

    // ================= CHURN SAVE OFFER =================
    if (churn > 60) {
        return {
            type: "RETENTION_DISCOUNT",
            message:
`⚠️ We miss you!

Come back with 50% VIP discount for limited time.`,
            discount: 50
        };
    }

    // ================= BOOSTER PUSH =================
    if (value > 300) {
        return {
            type: "BOOSTER_PUSH",
            message:
`⚡ Speed up your progress!

XP boosters available now.`,
            discount: 10
        };
    }

    return null;
}

// ================= EXECUTION =================
function runSaaSRevenueAI(message, user, lastActive, channel) {

    const offer = getOffer(user, lastActive);

    if (!offer) return;

    const key = `saas_${user.id}`;
    const now = Date.now();

    if (!global.__saasCooldown) {
        global.__saasCooldown = new Map();
    }

    const last = global.__saasCooldown.get(key) || 0;

    if (now - last < 120000) return; // 2 min cooldown

    global.__saasCooldown.set(key, now);

    channel.send(offer.message);
}

module.exports = {
    runSaaSRevenueAI,
    getDynamicPrice,
    calculateUserValue
};