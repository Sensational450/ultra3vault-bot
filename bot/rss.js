const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

// ================= DB =================
const { hasPosted, savePost } = require("../database/rssDB");

// ================= ENGINE =================
const { getScamScore, getRiskLevel } = require("./engine/antiScamAI");
const { logRSS, logSecurity } = require("../database/analyticsDB");

// 🧠 LEARNING AI
const { learnPositive, learnNegative, getLearningScore } =
    require("./engine/learningAI.js");

// 🐋 WHALE ENGINE
const { isWhaleTransaction, classifyWhale } =
    require("./engine/whaleTracker");

// 📈 SENTIMENT
const { getSentimentScore, getSentiment } =
    require("./engine/sentimentAI");

// ================= FIXED VIP IMPORT =================
const vipRouter = require("./engine/vipRouter");
const routeIntelligence = vipRouter?.routeIntelligence;

// 📊 ALPHA ENGINE
const { getAlphaScore } = require("./engine/alphaEngine");

// 💎 MEMBERSHIP SYSTEM
const membershipTiers = require("./engine/membershipTiers");

// 🔐 SUBSCRIPTION SYSTEM
const { getUserTier } = require("./engine/subscriptionManager");

const parser = new Parser();

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// ================= MEMORY CONTROL =================
const seen = new Set();
const MAX_SEEN = 500;

// ================= HELPERS =================
function safeSeenAdd(link) {
    if (seen.size > MAX_SEEN) {
        seen.clear(); // prevents memory leak
    }
    seen.add(link);
}

// ================= SCORE =================
async function getNewsScore(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    const highValue = [
        "bitcoin","btc","ethereum","eth","sec","etf",
        "hack","exploit","listing","binance","coinbase",
        "liquidation","crash","airdrop"
    ];

    const lowValue = [
        "sponsored","giveaway","click here",
        "subscribe","advertisement",
        "price prediction","opinion"
    ];

    highValue.forEach(w => { if (text.includes(w)) score += 3; });
    lowValue.forEach(w => { if (text.includes(w)) score -= 2; });

    if (text.length > 80) score += 1;

    return score + await getLearningScore(text);
}

// ================= ENGINE =================
async function fetchRSS(client) {
    if (!client) return;

    for (const feed of FEEDS) {
        try {
            const parsed = await parser.parseURL(feed);
            logRSS("feed_loaded", feed);

            // LIMIT ITEMS → prevents overload
            const items = parsed.items.slice(0, 3);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeSeenAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const fullText = title + " " + content;

                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {
                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");
                    continue;
                }

                const score = await getNewsScore(title, content);
                if (score <= 0) continue;

                const sentimentScore = getSentimentScore(title, content);
                const sentiment = getSentiment(sentimentScore);

                const whaleAlert = isWhaleTransaction(
                    classifyWhale(title, content)
                );

                // ================= SAFE VIP =================
                let vip = { channel: "crypto-news", tier: "FREE" };

                try {
                    if (routeIntelligence) {
                        vip = routeIntelligence({
                            score,
                            sentiment,
                            whaleAlert,
                            risk
                        }) || vip;
                    }
                } catch (e) {
                    console.log("⚠️ VIP fallback used");
                }

                const channel =
                    client.channels.cache.find(ch => ch.name === vip.channel);

                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription(content.slice(0, 200))
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });

                if (score >= 6) learnPositive(fullText);
                else learnNegative(fullText);

                await savePost(item.link, item.title);

            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;