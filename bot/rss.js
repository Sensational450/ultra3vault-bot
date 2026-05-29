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

// 🤖 SELF-LEARNING AI (FIXED IMPORT)
const {
    learnFromPost,
    getAdaptiveBoost
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
    getSentiment,
    detectTrendStrength,
    detectFearGreed,
    detectMarketEmotion,
    isExtremeFear,
    isExtremeGreed
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

// ================= BREAKING KEYWORDS =================
const BREAKING_KEYWORDS = [
    "bitcoin", "btc", "ethereum", "eth",
    "hack", "exploit", "liquidation",
    "crash", "pump", "dump",
    "sec", "etf", "listing",
    "binance", "coinbase"
];

// ================= AIRDROP KEYWORDS =================
const AIRDROP_KEYWORDS = [
    "airdrop", "testnet", "retroactive", "points",
    "reward", "farming", "quest", "whitelist",
    "early access", "beta", "campaign"
];

// ================= SCAM FILTER =================
const SCAM_KEYWORDS = [
    "send funds", "connect wallet", "claim now",
    "verify wallet", "urgent action", "private key",
    "seed phrase", "100% guaranteed"
];

// ================= AI SCORE =================
function getNewsScore(title = "", content = "") {

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

    score += getAdaptiveBoost(text);

    return score;
}

// ================= DETECTORS =================
function isBreakingNews(title = "") {
    return BREAKING_KEYWORDS.some(word =>
        title.toLowerCase().includes(word)
    );
}

function isAirdrop(title = "", content = "") {
    return AIRDROP_KEYWORDS.some(word =>
        (title + " " + content).toLowerCase().includes(word)
    );
}

function isScam(title = "", content = "") {
    return SCAM_KEYWORDS.some(word =>
        (title + " " + content).toLowerCase().includes(word)
    );
}

// ================= WHALE AMOUNT DETECTOR =================
function detectWhaleAmount(text = "") {

    const regex = /\$?([\d,.]+)\s?(million|billion|m|b)?/gi;

    let match;

    while ((match = regex.exec(text)) !== null) {

        let amount = parseFloat(
            match[1].replace(/,/g, "")
        );

        const unit = (match[2] || "").toLowerCase();

        if (unit === "billion" || unit === "b") {
            amount *= 1000000000;
        } else if (unit === "million" || unit === "m") {
            amount *= 1000000;
        }

        if (amount >= 100000) {
            return amount;
        }
    }

    return 0;
}

// ================= CATEGORY =================
function detectType(title = "") {

    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrops";
    if (text.includes("bitcoin") || text.includes("btc")) return "bitcoin-news";
    if (text.includes("ethereum") || text.includes("eth")) return "altcoin-news";
    if (text.includes("solana")) return "altcoin-news";
    if (text.includes("hack") || text.includes("exploit")) return "security-news";

    return "crypto-news";
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {

    if (!client) {
        console.log("❌ RSS ERROR: client missing");
        return;
    }

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

                const score = getNewsScore(title, content);

                if (score <= 0) continue;

                const airdrop = isAirdrop(title, content);
                const breaking = isBreakingNews(title);
                const category = detectType(title);

                const sentimentScore = getSentimentScore(title, content);
                const sentiment = getSentiment(sentimentScore);

                const whaleAmount = detectWhaleAmount(title + " " + content);
                const whaleAlert = isWhaleTransaction(whaleAmount);

                let channelName = category;

                if (whaleAlert) channelName = "whale-alerts";
                if (breaking) channelName = "breaking-news";
                if (airdrop) channelName = "airdrop-alerts";

                const channel = client.channels.cache.find(
                    ch => ch.name === channelName
                );

                if (!channel) continue;

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

                // ✅ FIXED LEARNING AI CALL
                learnFromPost(title, content, "NORMAL");

                await savePost(item.link, item.title);

                console.log(`✅ Posted: ${title}`);
            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;