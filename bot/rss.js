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

// 🤖 SELF-LEARNING AI
const {
    learnFromPost,
    getAdaptiveBoost
} = require("./engine/selfLearningAI");

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

                // ================= SCAM AI =================
                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                if (risk === "DANGEROUS") {

                    console.log(`🚨 BLOCKED SCAM: ${title}`);

                    logSecurity("SCAM_BLOCKED", title, "DANGEROUS");

                    continue;
                }

                if (risk === "SUSPICIOUS") {
                    logSecurity("SUSPICIOUS", title, "MEDIUM");
                }

                // ================= AI SCORE =================
                const score = getNewsScore(title, content);

                if (score <= 0) {

                    console.log("🚫 AI BLOCKED:", title);

                    continue;
                }

                // ================= FLAGS =================
                const airdrop = isAirdrop(title, content);
                const breaking = isBreakingNews(title);
                const category = detectType(title);

                // ================= SENTIMENT AI =================
                const sentimentScore = getSentimentScore(
                    title,
                    content
                );

                const sentiment = getSentiment(
                    sentimentScore
                );

                const trendStrength = detectTrendStrength(
                    sentimentScore
                );

                const marketEmotion = detectMarketEmotion(
                    title,
                    content
                );

                const fearGreed = detectFearGreed(
                    sentimentScore
                );

                const extremeFear = isExtremeFear(
                    sentimentScore
                );

                const extremeGreed = isExtremeGreed(
                    sentimentScore
                );

                // ================= WHALE ANALYSIS =================
                const whaleAmount = detectWhaleAmount(
                    title + " " + content
                );

                const whaleAlert = isWhaleTransaction(
                    whaleAmount
                );

                let whaleData = {
                    type: "NONE",
                    sentiment: "NEUTRAL"
                };

                let whaleScore = 0;
                let vipWhale = false;

                if (whaleAlert) {

                    whaleData = classifyWhale(
                        title,
                        content
                    );

                    whaleScore = getWhaleScore(
                        whaleAmount
                    );

                    vipWhale = isVIPWhale(
                        whaleScore
                    );
                }

                // ================= RULE ENGINE =================
                const priority = getPriority(score);

                const vipSignal = isVIPSignal(
                    score,
                    airdrop,
                    breaking
                );

                // ================= ROUTING =================
                let channel;

                if (whaleAlert) {

                    channel = client.channels.cache.find(
                        ch => ch.name === "whale-alerts"
                    );

                } else if (airdrop) {

                    channel = client.channels.cache.find(
                        ch => ch.name === "airdrop-alerts"
                    );

                } else if (breaking || score >= 6) {

                    channel = client.channels.cache.find(
                        ch => ch.name === "breaking-news"
                    );

                } else {

                    channel = client.channels.cache.find(
                        ch => ch.name === category
                    );
                }

                if (!channel) continue;

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(
                        whaleAlert
                            ? "🐋 WHALE ALERT: " + title
                            : airdrop
                                ? "💰 AIRDROP ALERT: " + title
                                : breaking
                                    ? "🚨 BREAKING: " + title
                                    : "🚀 " + title
                    )
                    .setURL(item.link)
                    .setDescription(
                        (content || "Latest crypto update").slice(0, 220)
                    )
                    .setColor(
                        extremeGreed
                            ? 0x00ff00
                            : extremeFear
                                ? 0xff0000
                                : sentiment === "BULLISH"
                                    ? 0x32CD32
                                    : sentiment === "BEARISH"
                                        ? 0xDC143C
                                        : whaleAlert
                                            ? 0x8A2BE2
                                            : airdrop
                                                ? 0xffd700
                                                : breaking
                                                    ? 0xff4500
                                                    : priority === "VIP"
                                                        ? 0xff00ff
                                                        : priority === "HIGH"
                                                            ? 0xffa500
                                                            : 0x00BFFF
                    )
                    .addFields(
                        {
                            name: "📡 Source",
                            value: parsed.title || "RSS Feed",
                            inline: true
                        },
                        {
                            name: "📂 Category",
                            value: category,
                            inline: true
                        },
                        {
                            name: "🧠 AI Score",
                            value: String(score),
                            inline: true
                        },
                        {
                            name: "📈 Market Sentiment",
                            value: sentiment,
                            inline: true
                        },
                        {
                            name: "🧠 Sentiment Score",
                            value: String(sentimentScore),
                            inline: true
                        },
                        {
                            name: "🔥 Trend Strength",
                            value: trendStrength,
                            inline: true
                        },
                        {
                            name: "😨 Fear & Greed",
                            value: fearGreed,
                            inline: true
                        },
                        {
                            name: "🧠 Market Emotion",
                            value: marketEmotion,
                            inline: true
                        },
                        {
                            name: "🚨 Extreme Fear",
                            value: extremeFear ? "YES" : "NO",
                            inline: true
                        },
                        {
                            name: "🚀 Extreme Greed",
                            value: extremeGreed ? "YES" : "NO",
                            inline: true
                        },
                        {
                            name: "⚡ Priority",
                            value: priority,
                            inline: true
                        },
                        {
                            name: "💰 Opportunity",
                            value: airdrop ? "AIRDROP" : "NEWS",
                            inline: true
                        },
                        {
                            name: "🛡️ Risk",
                            value: risk,
                            inline: true
                        },
                        {
                            name: "🐋 Whale Alert",
                            value: whaleAlert ? "YES" : "NO",
                            inline: true
                        }
                    )
                    .setTimestamp(
                        new Date(item.pubDate || Date.now())
                    );

                // ================= SEND =================
                await channel.send({ embeds: [embed] });

                learnFromPost(title, content, priority);

                await savePost(item.link, item.title);

                // ================= VIP WHALE =================
                if (vipWhale) {

                    const vipWhaleChannel = client.channels.cache.find(
                        ch => ch.name === "vip-whale-signals"
                    );

                    if (vipWhaleChannel) {

                        await vipWhaleChannel.send({
                            embeds: [embed]
                        }).catch(() => {});
                    }
                }

                // ================= MARKET EMOTION ALERT =================
                if (extremeFear || extremeGreed) {

                    const emotionChannel = client.channels.cache.find(
                        ch => ch.name === "market-emotions"
                    );

                    if (emotionChannel) {

                        await emotionChannel.send({
                            embeds: [embed]
                        }).catch(() => {});
                    }

                    console.log(
                        `🧠 MARKET EMOTION: ${marketEmotion}`
                    );
                }

                // ================= VIP SIGNAL =================
                if (vipSignal) {

                    const vipChannel = client.channels.cache.find(
                        ch => ch.name === "vip-alerts"
                    );

                    if (vipChannel) {
                        vipChannel.send({
                            embeds: [embed]
                        }).catch(() => {});
                    }

                    logVIPEvent("system", title);
                }

                console.log(`✅ Posted: ${title}`);
            }

        } catch (err) {

            console.error(
                `❌ RSS Error (${feed}):`,
                err.message
            );
        }
    }
}

module.exports = fetchRSS;