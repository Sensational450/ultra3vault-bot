const { runOrchestrator } = require("../ai/orchestrator");
const { handleMessage } = require("../engagementEngine");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");
const { runMonetizationAI } = require("../aiMonetizationEngine");

// ================= GLOBAL EVENT BUS =================
async function emitEvent(event, context = {}) {

    try {

        const { type, userId } = event;

        // ================= 1. MEMORY UPDATE =================
        if (updateFromMessage && userId && type === "MESSAGE") {
            updateFromMessage(userId, event.message, event.user);
        }

        // ================= 2. ENGAGEMENT ENGINE =================
        if (type === "MESSAGE" && event.message) {
            handleMessage(event.message);
        }

        // ================= 3. REVENUE EVENTS =================
        if (type === "REVENUE") {
            trackRevenue(event.data);
        }

        // ================= 4. AI ORCHESTRATOR =================
        if (runOrchestrator) {
            runOrchestrator(event, context);
        }

        // ================= 5. MONETIZATION AI =================
        if (runMonetizationAI && type === "MESSAGE") {
            runMonetizationAI(
                event.message,
                event.user,
                {},
                event.message.channel
            );
        }

        // ================= LOG =================
        console.log("🧠 EVENT BUS PROCESSED:", type);

    } catch (err) {
        console.log("❌ EVENT BUS ERROR:", err.message);
    }
}

module.exports = {
    emitEvent
};
