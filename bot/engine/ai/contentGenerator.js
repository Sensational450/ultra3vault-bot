const axios = require("axios");

// ================= CONFIG =================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ================= CORE GENERATOR =================
async function generateContent({
    type,
    user = null,
    memory = null,
    event = null,
    tone = "neutral"
}) {

    try {

        const prompt = buildPrompt({
            type,
            user,
            memory,
            event,
            tone
        });

        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are an AI content generator for a Discord business automation system. Generate short, high-conversion messages."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`
                }
            }
        );

        const output = res.data.choices?.[0]?.message?.content;

        return output || "⚠️ GENERATION FAILED";

    } catch (err) {
        console.log("❌ CONTENT GENERATOR ERROR:", err.message);
        return "⚠️ AI ERROR";
    }
}

// ================= PROMPT ENGINE =================
function buildPrompt({ type, user, memory, event, tone }) {

    return `
Generate a Discord message for an AI automation system.

TYPE: ${type}
TONE: ${tone}

USER DATA:
- Level: ${user?.level || 0}
- XP: ${user?.xp || 0}
- VIP Likelihood: ${memory?.vipLikelihood || 0}
- Engagement Score: ${memory?.engagementScore || 0}
- Churn Risk: ${memory?.churnRisk || 0}

EVENT:
- Title: ${event?.title || "N/A"}
- Type: ${event?.type || "N/A"}
- Value: ${event?.classification?.value || 0}
- Risk: ${event?.classification?.risk || "LOW"}

RULES:
- Keep it short (1–4 lines)
- Make it engaging
- Optimize for clicks or conversion
- If VIP offer, make it persuasive
- If alert, make it urgent
- If info, make it clear

OUTPUT ONLY THE MESSAGE TEXT.
`;
}

// ================= PRESET CONTENT TYPES =================
const ContentTypes = {
    VIP_OFFER: "VIP_OFFER",
    BOOSTER_OFFER: "BOOSTER_OFFER",
    RSS_INTEL: "RSS_INTEL",
    ALERT: "ALERT",
    ENGAGEMENT: "ENGAGEMENT",
    MARKETING: "MARKETING"
};

module.exports = {
    generateContent,
    ContentTypes
};