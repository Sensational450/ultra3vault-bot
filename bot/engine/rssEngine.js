const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const { hasPosted, savePost } = require("../../database/rssDB");
const { logRSS, logSecurity } = require("../../database/analyticsDB");

const { getScamScore, getRiskLevel } = require("./antiScamAI");
const { learnPositive, learnNegative, getLearningScore } = require("./learningAI");
const { getSentimentScore, getSentiment } = require("./sentimentAI");

const { isWhaleTransaction, classifyWhale } = require("./whaleTracker");
const vipRouter = require("./vipRouter");

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
    if (seen.size > MAX_SEEN) {
        seen.clear();
    }
    seen.add(link);
}

// ================= SCORE =================
async function getScore(text) {
    return await getLearningScore(text);
}

// ================= MAIN =================
async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {

        try {

            const parsed = await parser.parseURL(feed);

            logRSS("feed_loaded", feed);

            const items = parsed.items.slice(0, 2);

            for (const item of items) {

                if (!item?.link) continue;

                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const text = `${title} ${content}`;

                // ================= SCAM CHECK =================
                const scamScore = getScamScore(
                    title,
                    content,
                    item.link
                );

                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {

                    logSecurity(
                        "SCAM_BLOCKED",
                        title,
                        risk
                    );

                    continue;
                }

                // ================= SCORE =================
                const score = await getScore(text);

                if (score <= 0) continue;

                // ================= SENTIMENT =================
                const sentiment = getSentiment(
                    getSentimentScore(title, content)
                );

                // ================= WHALE =================
                const whaleInfo = classifyWhale(
                    title,
                    content
                );

                const whaleAlert =
                    whaleInfo?.type === "WHALE_TRANSFER";

                // ================= VIP ROUTING =================
                const vip =
                    vipRouter.routeIntelligence?.({
                        score,
                        sentiment,
                        whaleAlert,
                        risk
                    }) || {
                        channel: "crypto-news",
                        tier: "FREE"
                    };

                // ================= CHANNEL =================
                const channel =
                    client.channels.cache.find(
                        c => c.name === vip.channel
                    );

                if (!channel) continue;

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription(
                        (content || "").slice(0, 180)
                    )
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({
                    embeds: [embed]
                });

                // ================= SAVE =================
                await savePost(item.link, title);

                // ================= LEARNING =================
                if (score > 5) {
                    learnPositive(text);
                } else {
                    learnNegative(text);
                }

                console.log(
                    `✅ RSS Posted: ${title}`
                );
            }

        } catch (err) {

            console.log(
                `❌ RSS Error (${feed}):`,
                err.stack || err.message
            );
        }
    }
}

module.exports = fetchRSS;