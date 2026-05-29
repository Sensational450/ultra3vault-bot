const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

// ✅ SQLite integration
const { hasPosted, savePost } = require("../database/rssDB");

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

// ================= AI FILTER SYSTEM =================
function getNewsScore(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    const highValue = [
        "bitcoin", "btc", "ethereum", "eth",
        "sec", "etf", "hack", "exploit",
        "listing", "binance", "coinbase",
        "liquidation", "crash"
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

    return score;
}

function isBreakingNews(title = "") {
    const text = title.toLowerCase();
    return BREAKING_KEYWORDS.some(word => text.includes(word));
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
            const items = parsed.items || [];

            for (const item of items.slice(0, 5)) {

                if (!item.link) continue;

                // ================= DUPLICATE CHECK =================
                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";

                // ================= AI SCORE =================
                const score = getNewsScore(title, content);

                if (score <= 0) {
                    console.log("🚫 AI BLOCKED:", title);
                    continue;
                }

                // ================= QUALITY FILTER (extra safety) =================
                if (content.toLowerCase().includes("advertisement")) continue;

                // ================= BREAKING CHECK =================
                const breaking = isBreakingNews(title);

                const category = detectType(title);

                // ================= CHANNEL ROUTING =================
                let channel;

                if (breaking || score >= 6) {
                    channel = client.channels.cache.find(ch => ch.name === "breaking-news");
                } else {
                    channel = client.channels.cache.find(ch => ch.name === category);
                }

                if (!channel) continue;

                // ================= PRIORITY LABEL =================
                let priority =
                    score >= 6 ? "HIGH"
                    : score >= 3 ? "NORMAL"
                    : "LOW";

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(
                        breaking
                            ? "🚨 BREAKING: " + title
                            : "🚀 " + title
                    )
                    .setURL(item.link)
                    .setDescription(
                        (content || "Latest crypto update").slice(0, 220)
                    )
                    .setColor(
                        breaking
                            ? 0xff0000
                            : priority === "HIGH"
                                ? 0xffa500
                                : category === "airdrops"
                                    ? 0x00ff99
                                    : 0x00BFFF
                    )
                    .addFields(
                        { name: "📡 Source", value: parsed.title || "RSS Feed", inline: true },
                        { name: "📂 Category", value: category, inline: true },
                        { name: "🧠 AI Score", value: String(score), inline: true },
                        { name: "⚡ Priority", value: priority, inline: true }
                    )
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                // ================= SAVE =================
                savePost(item.link, item.title);

                console.log(`✅ Posted (${priority}): ${title}`);
            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;