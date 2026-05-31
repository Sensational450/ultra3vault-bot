const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db");

// ================= SAFE ANALYTICS =================
let logRSS = () => {};
let logSecurity = () => {};

try {
    const analytics = require("../../database/analyticsDB");
    logRSS = analytics.logRSS || (() => {});
    logSecurity = analytics.logSecurity || (() => {});
} catch {
    console.log("⚠️ Analytics DB disabled");
}

// ================= AI MODULES =================
const { getScamScore, getRiskLevel } = require("./antiScamAI");
const { learnPositive, learnNegative, getLearningScore } = require("./learningAI");
const { getSentimentScore, getSentiment } = require("./sentimentAI");
const { classifyWhale } = require("./whaleTracker");
const vipRouter = require("./vipRouter");

const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

// ================= MEMORY =================
const seen = new Set();
const MAX_SEEN = 200;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {

        try {
            const parsed = await parser.parseURL(feed);

            // safe async logging (prevents SQLITE_BUSY)
            setTimeout(() => {
                try { logRSS("feed_loaded", feed); } catch {}
            }, 0);

            const items = parsed.items.slice(0, 2);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;
                if (await hasPosted(item.link)) continue;

                safeAdd(item.link);

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const text = `${title} ${content}`;

                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {
                    try { logSecurity("SCAM_BLOCKED", title, risk); } catch {}
                    continue;
                }

                const score = await getLearningScore(text);
                if (score <= 0) continue;

                const sentiment = getSentiment(getSentimentScore(title, content));

                const whaleInfo = classifyWhale(title, content);
                const whaleAlert = whaleInfo?.type === "WHALE_TRANSFER";

                const vip = vipRouter.routeIntelligence?.({
                    score,
                    sentiment,
                    whaleAlert,
                    risk
                }) || { channel: "crypto-news", tier: "FREE" };

                const channel = client.channels.cache.find(c => c?.name === vip.channel);
                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });

                await savePost(item.link, title);

                if (score > 5) learnPositive(text);
                else learnNegative(text);

                console.log(`✅ RSS Posted: ${title}`);
            }

        } catch (err) {
            console.log(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;