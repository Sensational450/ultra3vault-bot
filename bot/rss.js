const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

// ================= DB =================
const { hasPosted, savePost } = require("../database/rssDB");

// ================= ENGINE =================
const { getScamScore, getRiskLevel } = require("./engine/antiScamAI");
const { logRSS, logSecurity } = require("../database/analyticsDB");

// 🧠 LEARNING AI
const {
    learnPositive,
    learnNegative,
    getLearningScore
} = require("./engine/learningAI.js");

// 🐋 WHALE ENGINE
const {
    isWhaleTransaction,
    classifyWhale
} = require("./engine/whaleTracker");

// 📈 SENTIMENT
const {
    getSentimentScore,
    getSentiment
} = require("./engine/sentimentAI");

// 🧠 VIP ROUTER (CORE BRAIN)
const { getVIPClass } = require("./engine/vipRouter");

// 📊 ALPHA ENGINE
const { getAlphaScore } = require("./engine/alphaEngine");

// 💎 MEMBERSHIP TIERS
const membershipTiers = require("./engine/membershipTiers");

const parser = new Parser();

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// ================= CACHE =================
const seen = new Set();

// ================= SCORE ENGINE =================
async function getNewsScore(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    const highValue = [
        "bitcoin","btc","ethereum","eth",
        "sec","etf","hack","exploit",
        "listing","binance","coinbase",
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

// ================= DETECTORS =================
function isBreakingNews(title = "") {
    return ["bitcoin","btc","ethereum","eth","hack","exploit","liquidation","crash","sec","etf"]
        .some(w => title.toLowerCase().includes(w));
}

function isAirdrop(title = "", content = "") {
    return ["airdrop","testnet","retroactive","quest","whitelist","beta"]
        .some(w => (title + " " + content).toLowerCase().includes(w));
}

// ================= WHALE =================
function detectWhaleAmount(text = "") {
    const regex = /\$?([\d,.]+)\s?(million|billion|m|b)?/gi;

    let match;

    while ((match = regex.exec(text)) !== null) {
        let amount = parseFloat(match[1].replace(/,/g, ""));
        const unit = (match[2] || "").toLowerCase();

        if (unit === "billion" || unit === "b") amount *= 1e9;
        else if (unit === "million" || unit === "m") amount *= 1e6;

        if (amount >= 100000) return amount;
    }

    return 0;
}

// ================= CATEGORY =================
function detectType(title = "") {
    const t = title.toLowerCase();

    if (t.includes("airdrop")) return "airdrop-alerts";
    if (t.includes("bitcoin") || t.includes("btc")) return "bitcoin-news";
    if (t.includes("ethereum") || t.includes("eth")) return "altcoin-news";
    if (t.includes("hack") || t.includes("exploit")) return "security-news";

    return "crypto-news";
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {
    if (!client) return;

    for (const feed of FEEDS) {
        try {
            const parsed = await parser.parseURL(feed);
            logRSS("feed_loaded", feed);

            for (const item of parsed.items.slice(0, 5)) {

                if (!item.link) continue;
                if (seen.has(item.link)) continue;
                seen.add(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";
                const fullText = title + " " + content;

                // ================= SCAM =================
                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {
                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");
                    continue;
                }

                // ================= SCORE =================
                const score = await getNewsScore(title, content);
                if (score <= 0) continue;

                // ================= FLAGS =================
                const airdrop = isAirdrop(title, content);
                const breaking = isBreakingNews(title);

                // ================= SENTIMENT =================
                const sentimentScore = getSentimentScore(title, content);
                const sentiment = getSentiment(sentimentScore);

                // ================= WHALE =================
                const whaleAmount = detectWhaleAmount(fullText);
                const whaleAlert = isWhaleTransaction(whaleAmount);

                const whaleData = whaleAlert
                    ? classifyWhale(title, content)
                    : { type: "NONE", sentiment: "NEUTRAL" };

                // ================= VIP CLASS =================
                const vip = getVIPClass({
                    score,
                    sentiment,
                    whaleAlert,
                    risk,
                    breaking,
                    airdrop
                });

                // ================= ALPHA =================
                const alpha = getAlphaScore({
                    score,
                    sentiment,
                    whaleAlert,
                    vipTier: vip.tier,
                    breaking,
                    airdrop
                });

                // ================= ROUTING =================
                const channelMap = {
                    SECURITY_THREAT: "security-alerts",
                    WHALE_MOVE: "whale-alerts",
                    VIP_ALPHA: "vip-alpha",
                    VIP_SIGNAL: "vip-alerts",
                    AIR_DROP: "airdrop-alerts",
                    WATCHLIST: "breaking-news",
                    NOISE: "crypto-news"
                };

                const channelName = channelMap[vip.tier] || "crypto-news";

                const channel = client.channels.cache.find(
                    ch => ch.name === channelName
                );

                if (!channel) continue;

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "Latest update").slice(0, 220))
                    .setColor(
                        vip.tier === "VIP_ALPHA" ? 0xff00ff :
                        vip.tier === "WHALE_MOVE" ? 0x8A2BE2 :
                        vip.tier === "SECURITY_THREAT" ? 0xff0000 :
                        sentiment === "BULLISH" ? 0x00ff00 :
                        sentiment === "BEARISH" ? 0xff0000 :
                        0x00BFFF
                    )
                    .addFields(
                        { name: "🧠 Tier", value: vip.tier, inline: true },
                        { name: "🎯 Confidence", value: vip.confidence + "%", inline: true },
                        { name: "⚡ Score", value: String(score), inline: true },

                        { name: "📊 Pump", value: alpha.pump + "%", inline: true },
                        { name: "📉 Dump", value: alpha.dump + "%", inline: true },
                        { name: "🎯 Action", value: alpha.action, inline: true },

                        { name: "📈 Sentiment", value: sentiment, inline: true },
                        { name: "🐋 Whale", value: whaleAlert ? "YES" : "NO", inline: true },
                        { name: "💰 Type", value: whaleData.type, inline: true },

                        { name: "📡 System", value: "Ultra3 Intelligence Router v3", inline: true }
                    )
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                // ================= LEARNING =================
                if (score >= 6) learnPositive(fullText);
                else learnNegative(fullText);

                await savePost(item.link, item.title);

                console.log(`🚀 [${vip.tier} | ${alpha.action}] → ${channelName}: ${title}`);
            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;