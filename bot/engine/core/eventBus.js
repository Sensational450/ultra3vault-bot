const { runOrchestrator } = require("../ai/orchestrator");
const { updateFromMessage } = require("../userMemoryEngine");
const { trackRevenue } = require("../revenueEngine");

// ================= GLOBAL EVENT BUS =================
async function emitEvent(event, context = {}) {

    try {

        const { type, userId } = event;

        // ================= MEMORY =================
        if (
            type === "MESSAGE" &&
            userId &&
            updateFromMessage &&
            event.message &&
            event.user
        ) {
            updateFromMessage(
                userId,
                event.message,
                event.user
            );
        }

        // ================= REVENUE =================
        if (
            type === "REVENUE" &&
            trackRevenue &&
            event.data
        ) {
            trackRevenue(event.data);
        }

        // ================= AI ORCHESTRATOR =================
        if (runOrchestrator) {
            await runOrchestrator(
                event,
                context
            );
        }

        console.log(
            `🧠 EVENT BUS → ${type}`
        );

    } catch (err) {

        console.log(
            "❌ EVENT BUS ERROR:",
            err.message
        );

    }
}

module.exports = {
    emitEvent
};