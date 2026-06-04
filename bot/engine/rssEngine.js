const Parser = require("rss-parser");
const db = require("../../database/db");

const {
    getSentimentScore,
    getSentiment
} = require("./sentimentAI");

const {
    getScamScore,
    getRiskLevel
} = require("./antiScamAI");

const { routeIntelligence } = require("./vipRouter");

// ================= EVENT BUS =================
const { emitEvent } = require("../eventBus");

const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

const seen = new Set();
const MAX_SEEN = 300;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

function detectTopic(title = "") {
    const t = title.toLowerCase();

    if (t.includes("airdrop")) return "airdrop-news";
    if (t.includes("hack")) return "security-alerts";
    if (t.includes("whale")) return "whale-alerts";
    if (t.includes("sec")) return "alpha-news";

    return "crypto-news";
}

async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {
        try {

            const parsed = await parser.parseURL(feed);
            const items = parsed.items.slice(0, 3);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                const title = item.title || "Untitled";
                const content = item.contentSnippet || "";

                const score = getSentimentScore(title, content);
                const sentiment = getSentiment(score);
                const risk = getRiskLevel(getScamScore(title, content, item.link));

                const channel = detectTopic(title);

                const payload = {
                    type: "RSS",
                    title,
                    content,
                    link: item.link,
                    classification: {
                        score,
                        sentiment,
                        risk,
                        channel
                    },
                    timestamp: Date.now()
                };

                // 🔥 SEND TO EVENT BUS (IMPORTANT FIX)
                emitEvent(payload, { client });

                console.log(`🧠 RSS EVENT EMITTED → ${channel}`);
            }

        } catch (err) {
            console.log("❌ RSS ERROR:", err.message);
        }
    }
}

module.exports = fetchRSS;