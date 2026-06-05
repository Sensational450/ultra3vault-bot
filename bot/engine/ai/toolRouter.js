const { openAIChat } = require("../tools/openaiChatAPI");

// ================= TOOL REGISTRY =================
const tools = {
    chat: "openAIChat",
    moderation: "moderateText",
    marketing: "generateMarketing",
    sentiment: "getSentiment",
    scam: "getScamScore"
};

// ================= TOOL ROUTER =================
async function routeTool(event) {

    try {

        const input =
            event.message?.content ||
            event.title ||
            "";

        const prompt = `
You are an AI tool router.

Choose the BEST tool for this input.

TOOLS AVAILABLE:
- chat (general response)
- moderation (detect scam, abuse, unsafe content)
- marketing (promotion or offers)
- sentiment (analyze emotion)
- scam (detect fraud)

INPUT:
${input}

Return ONLY JSON:
{
  "tool": "...",
  "reason": "..."
}
`;

        const res = await openAIChat(prompt,
            "You are a decision engine that selects tools."
        );

        let decision;

        try {
            decision = JSON.parse(res);
        } catch (e) {
            decision = { tool: "chat", reason: "fallback" };
        }

        console.log("🧠 TOOL ROUTER DECISION:", decision);

        return decision;

    } catch (err) {
        console.log("❌ Tool Router Error:", err.message);
        return { tool: "chat", reason: "error fallback" };
    }
}

module.exports = {
    routeTool
};