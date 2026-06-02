const { handleMessage } = require("../engagementEngine");
const { giveBooster } = require("../boosterEngine");
const { grantVIP } = require("../vipEngine");
const axios = require("axios");

// ================= AGENTS =================
const agents = {};

// ================= LLM DECISION ENGINE =================
async function aiDecide(event) {

    try {

        const prompt = `
You are an AI decision engine for a Discord automation system.

Analyze this event and return ONLY JSON.

EVENT:
Title: ${event.title}
Type: ${event.classification.type}
Sentiment: ${event.classification.sentiment}
Value: ${event.classification.value}
Risk: ${event.classification.risk}

Return format:
{
  "engagement": true/false,
  "monetization": true/false,
  "alert": true/false,
  "boost": true/false,
  "broadcast": true/false,
  "reason": "short reason"
}
`;

        // ⚠️ You can switch this to OpenAI / Claude / local LLM later
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.2
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                }
            }
        );

        const output = res.data.choices[0].message.content;

        return JSON.parse(output);

    } catch (err) {

        console.log("🧠 LLM ERROR:", err.message);

        // fallback safe mode
        return {
            engagement: true,
            monetization: false,
            alert: false,
            boost: false,
            broadcast: false,
            reason: "fallback mode"
        };
    }
}

// ================= MAIN ROUTER =================
async function routeEvent(event) {

    try {

        // ================= AI DECISION =================
        const decision = await aiDecide(event);

        processEvent(event, decision);

    } catch (err) {
        console.log("ROUTER ERROR:", err.message);
    }
}

// ================= EVENT PROCESSOR =================
function processEvent(event, decision) {

    const c = event.classification;

    // ================= ENGAGEMENT =================
    if (decision.engagement) {
        agents.engagement?.(event);
    }

    // ================= MONETIZATION =================
    if (decision.monetization) {
        agents.monetization?.(event);
    }

    // ================= BOOST SYSTEM =================
    if (decision.boost) {
        agents.boost?.(event);
    }

    // ================= ALERT SYSTEM =================
    if (decision.alert) {
        console.log("⚠️ ALERT:", event.title);
    }

    // ================= BROADCAST =================
    if (decision.broadcast) {
        agents.broadcast?.(event);
    }

    console.log("🧠 AI REASON:", decision.reason);
}

// ================= REGISTER AGENTS =================
function registerAgent(name, fn) {
    agents[name] = fn;
}

// ================= DEFAULT AGENTS =================
registerAgent("engagement", (event) => {
    console.log("🎯 Engagement triggered:", event.title);
});

registerAgent("monetization", (event) => {
    console.log("💰 Monetization triggered:", event.title);
});

registerAgent("boost", (event) => {
    console.log("⚡ Booster triggered:", event.title);
});

registerAgent("broadcast", (event) => {
    console.log("📢 Broadcast:", event.title);
});

module.exports = {
    routeEvent,
    registerAgent
};