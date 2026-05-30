const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

// ================= DB =================
const { hasPosted, savePost } = require("../database/rssDB");
const { logRSS, logSecurity } = require("../database/analyticsDB");

// ================= ENGINE =================
const { getScamScore, getRiskLevel } = require("./engine/antiScamAI");
const { learnPositive, learnNegative, getLearningScore } = require("./engine/learningAI");
const { isWhaleTransaction, classifyWhale } = require("./engine/whaleTracker");
const { getSentimentScore, getSentiment } = require("./engine/sentimentAI");
const { getAlphaScore } = require("./engine/alphaEngine");

// ================= VIP ROUTER (SAFE IMPORT) =================
const vipRouter = require("./engine/vipRouter");
const routeIntelligence = vipRouter?.routeIntelligence;

// ================= SUBSCRIPTION =================
const { hasAccess } = require("./engine/subscriptionManager");

// ================= PARSER =================
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
const MAX_SEEN = 300;

// prevent CPU + memory overload
function safeSeenAdd(link) {
    if (seen.size > MAX_SEEN) {
        seen.clear();
    }
    seen.add(link);
}

// ================= SCORE ENGINE =================
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

// ================= MAIN ENGINE =================
async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {

        try {
            const parsed = await parser.parseURL(feed);

            logRSS("feed_loaded", feed);

            // LIMIT ITEMS → prevents overload spikes
            const items = parsed.items.slice(0, 2);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeSeenAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const fullText = title + " " + content;

                // ================= SCAM FILTER =================
                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {
                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");
                    continue;
                }

                // ================= SCORE =================
                const score = await getNewsScore(title, content);
                if (score <= 0) continue;

                // ================= SENTIMENT =================
                const sentiment = getSentiment(getSentimentScore(title, content));

                // ================= WHALE =================
                const whaleAlert = isWhaleTransaction(
                    classifyWhale(title, content)
                );

                // ================= VIP ROUTING (SAFE) =================
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

                // ================= ACCESS CONTROL (IMPORTANT FIX) =================
                const allowed = hasAccess("GLOBAL", vip.channel);
                if (!allowed) continue;

                // ================= CHANNEL RESOLVE =================
                const channel =
                    client.channels.cache.find(ch => ch.name === vip.channel);

                if (!channel) continue;

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });

                // ================= LEARNING =================
                if (score >= 6) learnPositive(fullText);
                else learnNegative(fullText);

                await savePost(item.link, item.title);

            }

        } catch (err) {
            console.log(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;