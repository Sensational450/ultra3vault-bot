const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const { hasPosted, savePost } = require("../../database/rssDB");
const { logRSS } = require("../../database/analyticsDB");

const { getScamScore, getRiskLevel } = require("./antiScamAI");
const { learnPositive, learnNegative, getLearningScore } = require("./learningAI");
const { getSentimentScore, getSentiment } = require("./sentimentAI");

const { isWhaleTransaction, classifyWhale } = require("./whaleTracker");
const vipRouter = require("./vipRouter");

const { hasAccess } = require("./subscriptionManager");

const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

// ================= MEMORY SAFE =================
const seen = new Set();
const MAX_SEEN = 200;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= SCORE =================
async function getScore(text) {
    return await getLearningScore(text);
}

// ================= MAIN =================
async function fetchRSS(client) {

    for (const feed of FEEDS) {

        try {
            const parsed = await parser.parseURL(feed);

            const items = parsed.items.slice(0, 2); // LIMIT HARD

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const text = title + content;

                const risk = getRiskScore(title, content);
                if (risk === "DANGEROUS") continue;

                const score = await getScore(text);
                if (score <= 0) continue;

                const sentiment = getSentiment(getSentimentScore(text));

                const vip = vipRouter.routeIntelligence?.({
                    score,
                    sentiment
                }) || { channel: "crypto-news", tier: "FREE" };

                // 🔐 ACCESS CONTROL FIX
                if (!hasAccess("GLOBAL", vip.channel)) continue;

                const channel = client.channels.cache.find(c => c.name === vip.channel);
                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription(content.slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });

                await savePost(item.link, title);

                if (score > 5) learnPositive(text);
                else learnNegative(text);
            }

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }
    }
}

module.exports = fetchRSS;