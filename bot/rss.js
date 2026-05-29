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

// ================= QUALITY FILTER =================
function isLowQuality(title = "", content = "") {
    const text = (title + " + " + content).toLowerCase();

    const spamKeywords = [
        "sponsored",
        "giveaway",
        "click here",
        "subscribe",
        "advertisement"
    ];

    return spamKeywords.some(word => text.includes(word));
}

// ================= CATEGORY DETECTION =================
function detectType(title = "") {
    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrops";
    if (text.includes("bitcoin") || text.includes("btc")) return "bitcoin-news";
    if (text.includes("ethereum") || text.includes("eth")) return "altcoin-news";
    if (text.includes("solana")) return "altcoin-news";
    if (text.includes("hack") || text.includes("exploit")) return "security-news";

    return "crypto-news";
}

// ================= BREAKING NEWS SYSTEM =================
const BREAKING_KEYWORDS = [
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "hack",
    "exploit",
    "liquidation",
    "crash",
    "pump",
    "dump",
    "sec",
    "etf",
    "listing",
    "binance",
    "coinbase"
];

function isBreakingNews(title = "") {
    const text = title.toLowerCase();
    return BREAKING_KEYWORDS.some(word => text.includes(word));
}

// ================= MAIN RSS ENGINE =================
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

                // ================= DATABASE DUPLICATE CHECK =================
                if (await hasPosted(item.link)) continue;

                // ================= QUALITY FILTER =================
                if (isLowQuality(item.title, item.contentSnippet)) {
                    console.log("🚫 Skipped low quality:", item.title);
                    continue;
                }

                const title = item.title || "";
                const category = detectType(title);

                // ================= BREAKING NEWS CHECK =================
                const breaking = isBreakingNews(title);

                // ================= CHANNEL ROUTING =================
                let channel;

                if (breaking) {
                    channel = client.channels.cache.find(ch => ch.name === "breaking-news");
                } else {
                    channel = client.channels.cache.find(ch => ch.name === category);
                }

                if (!channel) continue;

                // ================= SMART EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(
                        breaking
                            ? "🚨 BREAKING: " + title
                            : "🚀 " + title
                    )
                    .setURL(item.link)
                    .setDescription(
                        (item.contentSnippet || "Latest crypto update").slice(0, 220)
                    )
                    .setColor(
                        breaking
                            ? 0xff0000
                            : (category === "airdrops" ? 0x00ff99 : 0x00BFFF)
                    )
                    .addFields(
                        { name: "📡 Source", value: parsed.title || "RSS Feed", inline: true },
                        { name: "📂 Category", value: category, inline: true },
                        { name: "⚡ Priority", value: breaking ? "BREAKING" : "NORMAL", inline: true }
                    )
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                // ================= SAVE TO DATABASE =================
                savePost(item.link, item.title);

                console.log(`✅ Posted: ${item.title}`);

            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

// ================= EXPORT =================
module.exports = fetchRSS;