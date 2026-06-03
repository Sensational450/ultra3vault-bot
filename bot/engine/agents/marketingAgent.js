const { registerAgent } = require("../ai/orchestrator");
const { trackRevenue } = require("../revenueEngine");

// ================= MARKETING AGENT =================
function marketingAgent(event, context = {}) {

    try {

        // ================= ONLY HANDLE RSS OR HIGH VALUE EVENTS =================
        if (!event) return;

        const title =
            event.title ||
            event.message?.content ||
            "";

        const text = title.toLowerCase();

        // ================= MARKETING TRIGGERS =================
        const isHighValue =
            text.includes("airdrop") ||
            text.includes("launch") ||
            text.includes("presale") ||
            text.includes("earn") ||
            event.classification?.value >= 4;

        if (!isHighValue) return;

        const userId = event.userId || null;

        // ================= CREATE MARKETING ACTION =================
        const marketingAction = {
            type: "PROMO_SIGNAL",
            priority: "HIGH",
            message: "User may be ready for offer",
            data: event
        };

        console.log("📢 MARKETING AGENT TRIGGERED:", title);

        // ================= OPTIONAL REVENUE SIGNAL =================
        trackRevenue?.({
            userId: userId || "system",
            itemType: "MARKETING_SIGNAL",
            itemId: "AI_MARKETING",
            amount: 0,
            source: "agent",
            aiTriggered: 1
        });

        // ================= SEND TO CONTEXT =================
        if (context?.eventBus) {
            context.eventBus.emit("marketing_event", marketingAction);
        }

    } catch (err) {
        console.log("❌ Marketing Agent Error:", err.message);
    }
}

// ================= AUTO REGISTER =================
registerAgent("marketing", marketingAgent);

module.exports = marketingAgent;