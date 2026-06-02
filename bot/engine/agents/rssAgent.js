const Parser = require("rss-parser");
const parser = new Parser();

const { routeEvent } = require("../router/eventRouter");

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/"
];

// ================= GLOBAL CLASSIFIER =================
function analyzeContent(text) {

    const t = text.toLowerCase();

    return {
        type: detectType(t),
        sentiment: detectSentiment(t),
        value: detectValue(t),
        risk: detectRisk(t)
    };
}

function detectType(t) {
    if (t.includes("airdrop")) return "AIR_DROP";
    if (t.includes("hack") || t.includes("exploit")) return "SECURITY";
    if (t.includes("update") || t.includes("launch")) return "PROJECT";
    if (t.includes("price")) return "MARKET";
    return "GENERAL";
}

function detectSentiment(t) {
    if (t.includes("hack") || t.includes("crash")) return "NEGATIVE";
    if (t.includes("surge") || t.includes("gain")) return "POSITIVE";
    return "NEUTRAL";
}

function detectValue(t) {
    if (t.includes("airdrop")) return 5;
    if (t.includes("earn") || t.includes("reward")) return 4;
    if (t.includes("launch")) return 3;
    return 1;
}

function detectRisk(t) {
    if (t.includes("hack")) return "HIGH";
    return "LOW";
}

// ================= EVENT CREATOR =================
function createEvent(item, analysis) {

    return {
        source: "RSS",
        title: item.title,
        link: item.link,

        classification: analysis,

        timestamp: Date.now(),

        // THIS IS WHAT MAKES IT A “UNIVERSAL SYSTEM EVENT”
        eventType: "GLOBAL_DISCORD_EVENT"
    };
}

// ================= MAIN PROCESSOR =================
async function processRSS(client) {

    for (const feedUrl of FEEDS) {

        try {

            const feed = await parser.parseURL(feedUrl);

            for (const item of feed.items.slice(0, 5)) {

                const analysis = analyzeContent(item.title);
                const event = createEvent(item, analysis);

                // ================= SEND TO GLOBAL AI ROUTER =================
                routeEvent(event);

                // ================= OPTIONAL DIRECT DISCORD OUTPUT =================
                if (analysis.value >= 4) {

                    client.channels.cache
                        .get(process.env.NEWS_CHANNEL_ID)
                        ?.send(
`📡 **GLOBAL EVENT DETECTED**

📰 ${item.title}

📊 Type: ${analysis.type}
⚠️ Risk: ${analysis.risk}
💎 Value Score: ${analysis.value}
🔗 ${item.link}`
                    );
                }
            }

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }
    }
}

module.exports = {
    processRSS
};
