const { getUserMemory } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");

// ================= BUSINESS AI CORE =================
async function runBusinessAI(message, user, context = {}) {

    const userId = message.author.id;

    getUserMemory(userId, (memory) => {

        if (!memory) return;

        const intent = analyzeIntent(message, memory);

        if (!intent.shouldSell) return;

        const offer = generateOffer(intent, memory);

        sendOffer(message.channel, userId, offer);

        trackRevenue({
            userId,
            itemType: offer.type,
            itemId: "AI_OFFER",
            amount: 0,
            source: "autonomous_ai",
            aiTriggered: 1
        });
    });
}

// ================= INTENT ENGINE =================
function analyzeIntent(message, memory) {

    const text = message.content.toLowerCase();

    const highIntent =
        text.includes("buy") ||
        text.includes("vip") ||
        text.includes("boost") ||
        memory.engagementScore > 10 ||
        memory.xpVelocity > 15;

    return {
        shouldSell: highIntent,
        urgency: memory.churnRisk > 60 ? "HIGH" : "MEDIUM"
    };
}

// ================= OFFER GENERATOR =================
function generateOffer(intent, memory) {

    if (memory.vipLikelihood > 60) {
        return {
            type: "VIP",
            message:
`👑 Upgrade to VIP now!

⚡ 2x XP boost
🏆 Faster leveling`
        };
    }

    if (memory.xpVelocity > 15) {
        return {
            type: "BOOSTER",
            message:
`⚡ Speed up your progress!

🚀 Boost XP instantly`
        };
    }

    return {
        type: "GENERIC",
        message:
`🔥 Limited offer available!`
    };
}

// ================= SENDER =================
function sendOffer(channel, userId, offer) {

    channel.send(
`💡 <@${userId}>

${offer.message}`
    );
}

module.exports = { runBusinessAI };