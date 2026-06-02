const axios = require("axios");
const { registerEventToMemory } = require("../engine/userMemoryEngine");

// ================= AGENTS =================
const agents = {};

// ================= SAFE JSON PARSER =================
function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (err) {

        // fallback extraction if LLM adds extra text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e) {
                return null;
            }
        }

        return null;
    }
}

// ================= LLM DECISION ENGINE =================
async function aiDecide(event) {

    try {

        const prompt = `
You are an AI decision engine for a Discord SaaS automation system.

Return ONLY valid JSON.

EVENT:
Title: ${event.title}
Type: ${event.classification.type}
Sentiment: ${event.classification.sentiment}
Value: ${event.classification.value}
Risk: ${event.classification.risk}

Return format:
{
  "engagement": true,
  "monetization": true,
  "alert": false,
  "boost": false,
  "broadcast": false,
  "priority": 1-10,
  "reason": "short reason"
}
`;

        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
                }
            }
        );

        const output = res.data.choices[0].message.content;

        const parsed = safeParseJSON(output);

        if (!parsed) {
            throw new Error("Invalid JSON from AI");
        }

        return parsed;

    } catch (err) {

        console.log("🧠 LLM ERROR:", err.message);

        // fallback safe AI mode
        return {
            engagement: true,
            monetization: false,
            alert: false,
            boost: false,
            broadcast: false,
            priority: 5,
            reason: "fallback deterministic mode"
        };
    }
}

// ================= EVENT MEMORY LOGGER =================
function logToMemory(event, decision) {

    try {

        registerEventToMemory({
            title: event.title,
            type: event.classification.type,
            value: event.classification.value,
            risk: event.classification.risk,
            decision
        });

    } catch (err) {
        console.log("MEMORY LOG ERROR:", err.message);
    }
}

// ================= MAIN ROUTER =================
async function routeEvent(event) {

    try {

        // ================= AI DECISION =================
        const decision = await aiDecide(event);

        // ================= MEMORY STORAGE =================
        logToMemory(event, decision);

        // ================= PROCESS =================
        processEvent(event, decision, event);

    } catch (err) {
        console.log("ROUTER ERROR:", err.message);
    }
}

// ================= EVENT PROCESSOR =================
function processEvent(event, decision) {

    // ================= ENGAGEMENT =================
    if (decision.engagement) {
        agents.engagement?.(event, decision);
    }

    // ================= MONETIZATION =================
    if (decision.monetization) {
        agents.monetization?.(event, decision);
    }

    // ================= BOOST SYSTEM =================
    if (decision.boost) {
        agents.boost?.(event, decision);
    }

    // ================= ALERT =================
    if (decision.alert) {
        console.log("⚠️ ALERT:", event.title);
    }

    // ================= BROADCAST =================
    if (decision.broadcast) {
        agents.broadcast?.(event, decision);
    }

    console.log("🧠 AI DECISION:", decision.reason);
}

// ================= AGENT REGISTRATION =================
function registerAgent(name, fn) {
    agents[name] = fn;
}

// ================= DEFAULT AGENTS =================
registerAgent("engagement", (event) => {
    console.log("🎯 Engagement Agent:", event.title);
});

registerAgent("monetization", (event) => {
    console.log("💰 Monetization Agent:", event.title);
});

registerAgent("boost", (event) => {
    console.log("⚡ Boost Agent:", event.title);
});

registerAgent("broadcast", (event) => {
    console.log("📢 Broadcast Agent:", event.title);
});

module.exports = {
    routeEvent,
    registerAgent
};