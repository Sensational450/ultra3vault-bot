const { registerAgent } = require("../ai/orchestrator");
const { trackRevenue } = require("../revenueEngine");
const { generateContent } = require("../ai/contentGenerator");

// ================= CONFIG =================
const MIN_VALUE_SCORE = 4;
const COOLDOWN = new Map();

// ================= HIGH VALUE SCORER =================
function calculateValueScore(event) {
    const text = (
        event.title ||
        event.message?.content ||
        ""
    ).toLowerCase();

    let score = 0;

    if (text.includes("airdrop")) score += 2;
    if (text.includes("launch")) score += 2;
    if (text.includes("presale")) score += 2;
    if (text.includes("earn")) score += 1;
    if (text.includes("bonus")) score += 1;

    if (event.classification?.value) {
        score += event.classification.value;
    }

    return score;
}

// ================= COOLDOWN =================
function isOnCooldown(userId) {
    const now = Date.now();
    const last = COOLDOWN.get(userId) || 0;

    if (now - last < 30000) return true;

    COOLDOWN.set(userId, now);
    return false;
}

// ================= MARKETING AGENT v2.0 =================
async function marketingAgent(event, context = {}) {

    try {
        if (!event) return;

        const userId = event.userId || event.user?.id || "system";

        // ================= COOLDOWN CHECK =================
        if (isOnCooldown(userId)) return;

        const text = (
            event.title ||
            event.message?.content ||
            ""
        ).toLowerCase();

        // ================= VALUE SCORE =================
        const valueScore = calculateValueScore(event);

        if (valueScore < MIN_VALUE_SCORE) return;

        console.log("📢 MARKETING AGENT TRIGGERED:", event.title);

        // ================= AI CONTENT GENERATION =================
        let aiMessage = null;

        try {
            aiMessage = await generateContent({
                type: "MARKETING",
                tone: valueScore >= 7 ? "high-conversion" : "engagement",
                event,
                user: event.user || null,
                memory: event.memory || null
            });
        } catch (err) {
            console.log("⚠️ Content Gen Failed, fallback used");
            aiMessage = `🔥 Opportunity detected: ${event.title || "New Signal"}`;
        }

        // ================= REVENUE SIGNAL =================
        trackRevenue?.({
            userId,
            itemType: "MARKETING_SIGNAL",
            itemId: "AI_MARKETING_V2",
            amount: 0,
            source: "agent_v2",
            aiTriggered: 1
        });

        // ================= EVENT OUTPUT =================
        const marketingEvent = {
            type: "MARKETING_EVENT_V2",
            valueScore,
            priority: valueScore >= 7 ? "HIGH" : "MEDIUM",
            message: aiMessage,
            raw: event,
            timestamp: Date.now()
        };

        // ================= EMIT TO EVENT BUS =================
        if (context?.eventBus?.emit) {
            context.eventBus.emit("marketing_event", marketingEvent);
        }

        // ================= LOG =================
        console.log(
            `🧠 Marketing Score: ${valueScore} | Priority: ${marketingEvent.priority}`
        );

    } catch (err) {
        console.log("❌ Marketing Agent Error:", err.message);
    }
}

// ================= REGISTER AGENT =================
registerAgent("marketing", marketingAgent);

module.exports = marketingAgent;