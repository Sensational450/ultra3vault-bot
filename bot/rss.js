const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const parser = new Parser();

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// ================= SMART STORAGE =================
// keeps track of seen links in memory
const postedLinks = new Set();

// ================= QUALITY FILTER =================
function isLowQuality(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

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

                // ================= DUPLICATE PROTECTION =================
                if (postedLinks.has(item.link)) continue;
                postedLinks.add(item.link);

                // ================= QUALITY FILTER =================
                if (isLowQuality(item.title, item.contentSnippet)) {
                    console.log("🚫 Skipped low quality:", item.title);
                    continue;
                }

                const category = detectType(item.title || "");

                const channel = client.channels.cache.find(
                    ch => ch.name === category
                );

                if (!channel) continue;

                // ================= SMART EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle("🚀 " + (item.title || "Crypto Update"))
                    .setURL(item.link)
                    .setDescription(
                        (item.contentSnippet || "Latest crypto update").slice(0, 220)
                    )
                    .setColor(category === "airdrops" ? 0x00ff99 : 0x00BFFF)
                    .addFields(
                        { name: "📡 Source", value: parsed.title || "RSS Feed", inline: true },
                        { name: "📂 Category", value: category, inline: true }
                    )
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                console.log(`✅ Posted: ${item.title}`);

            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

// ================= EXPORT =================
module.exports = fetchRSS;