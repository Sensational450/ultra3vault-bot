const { getUserMemory } = require("./userMemoryEngine");

// ================= MAIN AI ENGINE =================
async function runMonetizationAI(message, user, meta = {}, channel) {

    const userId = message.author.id;

    getUserMemory(userId, (memory) => {

        if (!memory) return;

        const decision = generateDecision(memory, user);

        if (!decision.showOffer) return;

        sendOffer(channel, userId, decision);
    });
}

// ================= DECISION ENGINE =================
function generateDecision(memory, user) {

    const engagement = memory.engagementScore || 0;
    const monetization = memory.monetizationScore || 0;
    const vipLikelihood = memory.vipLikelihood || 0;
    const churnRisk = memory.churnRisk || 0;
    const xpVelocity = memory.xpVelocity || 0;

    // ================= DEFAULT =================
    let offer = {
        showOffer: false,
        offerType: "NONE",
        urgency: "LOW",
        message: null
    };

    // ================= VIP TARGETING =================
    if (vipLikelihood > 60 && engagement > 10) {

        offer = {
            showOffer: true,
            offerType: "VIP",
            urgency: vipLikelihood > 80 ? "HIGH" : "MEDIUM",
            message:
`👑 You're progressing fast!

Unlock VIP to:
⚡ Gain 2x XP
🏆 Rank faster on leaderboard`
        };
    }

    // ================= BOOSTER TARGETING =================
    else if (xpVelocity > 15 && engagement > 5) {

        offer = {
            showOffer: true,
            offerType: "BOOSTER",
            urgency: "MEDIUM",
            message:
`⚡ You're leveling quickly!

Use boosters to:
🚀 Speed up XP gain
📈 Reach higher ranks faster`
        };
    }

    // ================= CHURN RECOVERY =================
    else if (churnRisk > 60) {

        offer = {
            showOffer: true,
            offerType: "VIP",
            urgency: "HIGH",
            message:
`💔 We noticed you're less active...

Come back stronger with VIP:
🔥 Bonus XP
🎁 Exclusive perks`
        };
    }

    return offer;
}

// ================= MESSAGE SENDER =================
function sendOffer(channel, userId, decision) {

    const prefix =
        decision.urgency === "HIGH"
            ? "🚨 URGENT OFFER"
            : "💡 SPECIAL OFFER";

    channel.send(
`${prefix}

<@${userId}>

${decision.message}`
    );
}

module.exports = {
    runMonetizationAI
};