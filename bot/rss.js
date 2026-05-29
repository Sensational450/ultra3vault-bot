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

    // ================= BASE AI =================
    highValue.forEach(word => {
        if (text.includes(word)) score += 3;
    });

    lowValue.forEach(word => {
        if (text.includes(word)) score -= 2;
    });

    if (text.length > 80) score += 1;

    // ================= SELF-LEARNING BOOST =================
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

            // 📊 LOG FEED USAGE
            logRSS("feed_loaded", feed);

            const items = parsed.items || [];

            for (const item of items.slice(0, 5)) {

                if (!item.link) continue;

                // ================= DUPLICATE CHECK =================
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

                // ================= RULE ENGINE =================
                const priority = getPriority(score);

                const vipSignal = isVIPSignal(
                    score,
                    airdrop,
                    breaking
                );

                const channelName = getChannelName(
                    score,
                    airdrop,
                    breaking,
                    category
                );

                const channel = client.channels.cache.find(
                    ch => ch.name === channelName
                );

                if (!channel) continue;

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(
                        airdrop
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
                        airdrop
                            ? 0xffd700
                            : breaking
                                ? 0xff0000
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
                        }
                    )
                    .setTimestamp(
                        new Date(item.pubDate || Date.now())
                    );

                // ================= SEND =================
                await channel.send({ embeds: [embed] });

                // 🤖 AI LEARNS FROM SUCCESSFUL POSTS
                learnFromPost(title, content, priority);

                // ================= SAVE =================
                await savePost(item.link, item.title);

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

                // ================= LOGS =================
                if (priority === "VIP") {

                    console.log(`💎 VIP SIGNAL: ${title}`);

                } else if (airdrop) {

                    console.log(`💰 AIRDROP: ${title}`);

                } else {

                    console.log(`✅ Posted (${priority}): ${title}`);
                }
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