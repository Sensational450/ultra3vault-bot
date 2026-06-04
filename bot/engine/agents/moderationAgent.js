const { emitEvent } = require("../eventBus");

// ================= MODERATION AGENT v1 =================
async function moderationAgent(event) {

    try {

        if (!event) return;

        const text =
            (event.title ||
            event.message?.content ||
            "").toLowerCase();

        let risk = 0;

        // simple safety checks (v1 rules)
        if (text.includes("scam")) risk += 50;
        if (text.includes("hack")) risk += 30;
        if (text.includes("free money")) risk += 40;
        if (text.includes("phishing")) risk += 60;

        if (risk === 0) return;

        emitEvent({
            type: "MODERATION_EVENT",
            userId: event.userId,
            risk,
            data: event
        });

        console.log("🛡️ MODERATION FLAG:", risk);

    } catch (err) {
        console.log("❌ Moderation Error:", err.message);
    }
}

module.exports = moderationAgent;