const { emitEvent } = require("../eventBus");
const { moderateText } = require("../tools/moderationAPI");

// ================= MODERATION AGENT v2 (AI POWERED) =================
async function moderationAgent(event) {

    try {

        if (!event?.message) return;

        const text = event.message.content;

        const result = await moderateText(text);

        if (!result) return;

        const flagged = result.flagged;

        if (!flagged) return;

        const categories = result.categories || {};

        const risk =
            Object.values(categories).filter(Boolean).length * 20;

        emitEvent({
            type: "MODERATION_EVENT",
            userId: event.userId,
            risk,
            categories,
            data: event
        });

        console.log("🛡️ AI MODERATION FLAGGED:", risk);

    } catch (err) {
        console.log("❌ Moderation Error:", err.message);
    }
}

module.exports = moderationAgent;