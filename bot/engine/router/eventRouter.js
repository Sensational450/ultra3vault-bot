const { runOrchestrator } = require("../ai/orchestrator");
const { handleMessage } = require("../engagementEngine");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");
const { runMonetizationAI } = require("../aiMonetizationEngine");

// ================= GLOBAL EVENT BUS v2.0 =================
async function emitEvent(event, context = {}) {

    try {

        const { type, userId } = event;

        // ================= MEMORY =================
        if (updateFromMessage && type === "MESSAGE") {
            updateFromMessage(userId, event.message, event.user);
        }

        // ================= ENGAGEMENT =================
        if (type === "MESSAGE") {
            handleMessage(event.message);
        }

        // ================= REVENUE =================
        if (type === "REVENUE") {
            trackRevenue(event.data);
        }

        // ================= ORCHESTRATOR (BRAIN) =================
        if (runOrchestrator) {
            await runOrchestrator(event, context);
        }

        // ================= MONETIZATION AI =================
        if (runMonetizationAI && type === "MESSAGE") {
            runMonetizationAI(
                event.message,
                event.user,
                {},
                event.message.channel
            );
        }

        console.log("🧠 EVENT BUS PROCESSED:", type);

    } catch (err) {
        console.log("❌ EVENT BUS ERROR:", err.message);
    }
}

module.exports = {
    emitEvent
};