const { getUserMemory } = require("./userMemoryEngine");

// ================= GLOBAL OFFER CACHE =================
const offerCooldown = new Map();

// ================= CONFIG =================
const OFFER_COOLDOWN_TIME = 60 * 1000; // 1 min per user
const FATIGUE_LIMIT = 5; // max offers per session

const sessionCounter = new Map();

// ================= MAIN AI ENGINE =================
async function runMonetizationAI(message, user, meta = {}, channel) {

    const userId = message.author.id;

    // ================= COOLDOWN CONTROL =================
    const now = Date.now();

    if (offerCooldown.has(userId)) {
        const last = offerCooldown.get(userId);
        if (now - last < OFFER_COOLDOWN_TIME) return;
    }

    offerCooldown.set(userId, now);

    // ================= SESSION TRACKING =================
    const sessionCount = (sessionCounter.get(userId) || 0) + 1;
    sessionCounter.set(userId, sessionCount);

    if (sessionCount > FATIGUE_LIMIT) return; // avoid spam

    // ================= LOAD USER MEMORY =================
    getUserMemory(userId, (memory) => {

        if (!memory) return;

        const decision = generateDecision(memory, user, meta);

        if (!decision.showOffer) return;

        sendOffer(channel, userId, decision);
    });
}

// ================= INTELLIGENCE DECISION ENGINE =================
function generateDecision(memory, user, meta) {

    const engagement = memory.engagementScore || 0;
    const monetization = memory.monetizationScore || 0;
    const vipLikelihood = memory.vipLikelihood || 0;
    const churnRisk = memory.churnRisk || 0;
    const xpVelocity = memory.xpVelocity || 0;

    const level = user.level || 1;
    const activity = memory.activityScore || 0;

    // ================= OFFER SCORE SYSTEM =================
    let vipScore =
        vipLikelihood * 0.4 +
        engagement * 0.2 +
        level * 0.2 +
        activity * 0.2;

    let boosterScore =
        xpVelocity * 0.5 +
        engagement * 0.3 +
        level * 0.2;

    let churnScore = churnRisk * 0.7 + (100 - activity) * 0.3;

    // ================= DEFAULT =================
    let offer = {
        showOffer: false,
        offerType: "NONE",
        urgency: "LOW",
        confidence: 0,
        message: null
    };

    // ================= VIP LOGIC =================
    if (vipScore > 60) {

        offer = {
            showOffer: true,
            offerType: "VIP",
            urgency: vipScore > 80 ? "HIGH" : "MEDIUM",
            confidence: vipScore,
            message:
`👑 You’re progressing fast!

Unlock VIP:
⚡ 2x XP boost
🏆 Faster leaderboard ranking
💎 Exclusive perks unlocked`
        };
    }

    // ================= BOOSTER LOGIC =================
    else if (boosterScore > 50) {

        offer = {
            showOffer: true,
            offerType: "BOOSTER",
            urgency: boosterScore > 75 ? "HIGH" : "MEDIUM",
            confidence: boosterScore,
            message:
`⚡ You're leveling efficiently!

Boost your progress:
🚀 Faster XP gain
📈 Reach higher ranks quicker`
        };
    }

    // ================= CHURN RECOVERY =================
    else if (churnScore > 65) {

        offer = {
            showOffer: true,
            offerType: "VIP",
            urgency: "HIGH",
            confidence: churnScore,
            message:
`💔 We miss your activity...

Come back stronger with VIP:
🔥 Bonus XP
🎁 Premium engagement perks`
        };
    }

    return offer;
}

// ================= SMART MESSAGE DELIVERY =================
function sendOffer(channel, userId, decision) {

    const prefix =
        decision.urgency === "HIGH"
            ? "🚨 AI-POWERED OFFER"
            : "💡 PERSONALIZED OFFER";

    channel.send(
`${prefix}

<@${userId}>

${decision.message}

📊 Confidence Score: ${Math.floor(decision.confidence)}%`
    );
}

module.exports = {
    runMonetizationAI
};