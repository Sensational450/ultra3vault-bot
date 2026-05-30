const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const { hasPosted, savePost } = require("../database/rssDB");

const { getScamScore, getRiskLevel } = require("./engine/antiScamAI");
const { logRSS, logSecurity } = require("../database/analyticsDB");

const { learnPositive, learnNegative, getLearningScore } =
    require("./engine/learningAI.js");

const { isWhaleTransaction, classifyWhale } =
    require("./engine/whaleTracker");

const { getSentimentScore, getSentiment } =
    require("./engine/sentimentAI");

const vipRouter = require("./engine/vipRouter");
const routeIntelligence = vipRouter?.routeIntelligence;

const { getAlphaScore } = require("./engine/alphaEngine");

const membershipTiers = require("./engine/membershipTiers");

const { getUserTier } = require("./engine/subscriptionManager");

const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// ================= MEMORY SAFETY =================
const seen = new Set();
const MAX_SEEN = 300;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= SCORE =================
async function getNewsScore(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    const high = ["bitcoin","btc","ethereum","eth","sec","hack","listing","airdrop"];
    const low = ["sponsored","advertisement","click here","price prediction"];

    high.forEach(w => { if (text.includes(w)) score += 3; });
    low.forEach(w => { if (text.includes(w)) score -= 2; });

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

            // 🔥 LIMIT ITEMS (BIG OVERLOAD FIX)
            const items = parsed.items.slice(0, 2);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const fullText = title + content;

                const scam = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scam);

                if (risk === "DANGEROUS") {
                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");
                    continue;
                }

                const score = await getNewsScore(title, content);
                if (score <= 0) continue;

                const sentiment = getSentiment(getSentimentScore(title, content));

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
                } catch {}

                const channel =
                    client.channels.cache.find(ch => ch.name === vip.channel);

                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });

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