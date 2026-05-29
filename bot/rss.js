const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

// ✅ SQLite integration
const { hasPosted, savePost } = require("../database/rssDB");

// 🧠 RULE ENGINE IMPORT
const {
    isVIPSignal,
    getPriority,
    getChannelName
} = require("./engine/rules");

// 🛡️ ANTI-SCAM AI IMPORT
const {
    getScamScore,
    getRiskLevel
} = require("./engine/antiScamAI");

// 📊 VIP ANALYTICS SYSTEM
const {
    logRSS,
    logSecurity,
    logVIPEvent
} = require("../database/analyticsDB");

// 🤖 SELF-LEARNING AI (FIXED)
const {
    learnPositive,
    learnNegative,
    getLearningScore
} = require("./engine/learningAI.js");

// 🐋 WHALE TRACKER
const {
    isWhaleTransaction,
    classifyWhale,
    getWhaleScore,
    isVIPWhale
} = require("./engine/whaleTracker");

// 📈 MARKET SENTIMENT AI
const {
    getSentimentScore,
    getSentiment
} = require("./engine/sentimentAI");

const parser = new Parser();

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// ================= AI SCORE =================
async function getNewsScore(title = "", content = "") {

    const text = (title + " " + content).toLowerCase();

    let score = 0;

    const highValue = [
        "bitcoin", "btc", "ethereum", "eth",
        "sec", "etf", "hack", "exploit",
        "listing", "binance", "coinbase",
        "liquidation", "crash", "airdrop"
    ];

    const lowValue = [
        "sponsored", "giveaway", "click here",
        "subscribe", "advertisement",
        "price prediction", "opinion"
    ];

    highValue.forEach(word => {
        if (text.includes(word)) score += 3;
    });

    lowValue.forEach(word => {
        if (text.includes(word)) score -= 2;
    });

    if (text.length > 80) score += 1;

    // 🧠 Self-learning boost (FIXED)
    const learningBoost = await getLearningScore(text);
    score += learningBoost;

    return score;
}

// ================= DETECTORS =================
function isBreakingNews(title = "") {
    return ["bitcoin","btc","ethereum","eth","hack","exploit","liquidation","crash","sec","etf"]
        .some(word => title.toLowerCase().includes(word));
}

function isAirdrop(title = "", content = "") {
    return ["airdrop","testnet","retroactive","quest","whitelist","beta"]
        .some(word => (title + " " + content).toLowerCase().includes(word));
}

// ================= WHALE DETECTOR =================
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

    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrop-alerts";
    if (text.includes("bitcoin") || text.includes("btc")) return "bitcoin-news";
    if (text.includes("ethereum") || text.includes("eth")) return "altcoin-news";
    if (text.includes("hack") || text.includes("exploit")) return "security-news";

    return "crypto-news";
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {

        try {

            const parsed = await parser.parseURL(feed);
            logRSS("feed_loaded", feed);

            const items = parsed.items || [];

            for (const item of items.slice(0, 5)) {

                if (!item.link) continue;
                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";

                // ================= SCAM CHECK =================
                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {
                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");
                    continue;
                }

                // ================= AI SCORE =================
                const score = await getNewsScore(title, content);
                if (score <= 0) continue;

                // ================= FLAGS =================
                const airdrop = isAirdrop(title, content);
                const breaking = isBreakingNews(title);
                const category = detectType(title);

                // ================= SENTIMENT =================
                const sentimentScore = getSentimentScore(title, content);
                const sentiment = getSentiment(sentimentScore);

                // ================= WHALE =================
                const whaleAmount = detectWhaleAmount(title + " " + content);
                const whaleAlert = isWhaleTransaction(whaleAmount);

                // ================= ROUTING =================
                let channelName = category;

                if (whaleAlert) channelName = "whale-alerts";
                else if (breaking) channelName = "breaking-news";
                else if (airdrop) channelName = "airdrop-alerts";

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
                        sentiment === "BULLISH"
                            ? 0x00ff00
                            : sentiment === "BEARISH"
                                ? 0xff0000
                                : whaleAlert
                                    ? 0x8A2BE2
                                    : 0x00BFFF
                    )
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                // 🧠 LEARNING AI FIXED
                const fullText = title + " " + content;

                if (score >= 6) learnPositive(fullText);
                else learnNegative(fullText);

                await savePost(item.link, item.title);

                console.log(`✅ Posted: ${title}`);
            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;