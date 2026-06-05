const { routeTool } = require("./toolRouter");

// agents
const chatAgent = require("../agents/chatAgent");
const marketingAgent = require("../agents/marketingAgent");
const moderationAgent = require("../agents/moderationAgent");

// ================= EVENT ROUTER =================
async function handleEvent(event, context = {}) {

    try {

        if (!event) return;

        // 🧠 STEP 1: AI DECISION
        const decision = await routeTool(event);

        console.log("🧠 ROUTER:", decision);

        // ================= STEP 2: ROUTING =================
        switch (decision.tool) {

            case "chat":
                return chatAgent(event, context);

            case "moderation":
                return moderationAgent(event, context);

            case "marketing":
                return marketingAgent(event, context);

            default:
                console.log("⚠️ No tool matched:", decision.tool);
        }

    } catch (err) {
        console.log("❌ EventRouter Error:", err.message);
    }
}

module.exports = {
    handleEvent
};