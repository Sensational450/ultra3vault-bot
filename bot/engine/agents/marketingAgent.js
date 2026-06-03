const { registerAgent } = require("../ai/orchestrator");
const { trackRevenue } = require("../revenueEngine");
const { generateContent } = require("../ai/contentGenerator");

// ================= MARKETING AGENT v2.0 =================
async function marketingAgent(event, context = {}) {

    try {

        if (!event) return;

        const text =
            (event.title ||
            event.message?.content ||
            "").toLowerCase();

        // ================= HIGH VALUE DETECTION =================
        const isHighValue =
            text.includes("airdrop") ||
            text.includes("launch") ||
            text.includes("presale") ||
            text.includes("earn") ||
            event.classification?.value >= 4;

        if (!isHighValue) return;

        console.log("📢 MARKETING AGENT TRIGGERED:", event.title);

        // ================= AI CONTENT GENERATION =================
        const aiMessage = await generateContent({
            type: "MARKETING",
            user: event.user || null,
            memory: event.memory || null,
            event,
            tone: "high-conversion"
        });

        // ================= REVENUE SIGNAL =================
        trackRevenue?.({
            userId: event.userId || "system",
            itemType: "MARKETING_SIGNAL",
            itemId: "AI_MARKETING",
            amount: 0,
            source: "agent",
            aiTriggered: 1
        });

        // ================= EMIT TO EVENT BUS =================
        context?.eventBus?.emit?.("marketing_event", {
            type: "MARKETING_EVENT",
            message: aiMessage,
            raw: event
        });

    } catch (err) {
        console.log("❌ Marketing Agent Error:", err.message);
    }
}

// ================= REGISTER =================
registerAgent("marketing", marketingAgent);

module.exports = marketingAgent;