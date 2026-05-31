const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db");

const {
    getSentimentScore,
    getSentiment
} = require("./sentimentAI");

const {
    getScamScore,
    getRiskLevel
} = require("./antiScamAI");

const { routeIntelligence } = require("./vipRouter");

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

const parser = new Parser();

// ================= MEMORY CACHE =================
const seen = new Set();
const MAX_SEEN = 200;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= IMAGE FALLBACK =================
function getFallbackImage(title = "") {
    const t = title.toLowerCase();

    if (t.includes("bitcoin") || t.includes("btc")) {
        return "https://cryptologos.cc/logos/bitcoin-btc-logo.png";
    }
    if (t.includes("ethereum") || t.includes("eth")) {
        return "https://cryptologos.cc/logos/ethereum-eth-logo.png";
    }
    if (t.includes("xrp")) {
        return "https://cryptologos.cc/logos/xrp-xrp-logo.png";
    }
    if (t.includes("solana")) {
        return "https://cryptologos.cc/logos/solana-sol-logo.png";
    }

    return "https://cryptologos.cc/logos/bitcoin-btc-logo.png";
}

// ================= DB HELPERS =================
function hasPosted(link) {
    return new Promise((resolve) => {
        db.get(
            "SELECT 1 FROM rss_posts WHERE link = ?",
            [link],
            (err, row) => {
                if (err) return resolve(false);
                resolve(!!row);
            }
        );
    });
}

function savePost(link, title) {
    db.run(
        "INSERT OR IGNORE INTO rss_posts (link, title) VALUES (?, ?)",
        [link, title]
    );
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {

    if (!client) return;

    for (const feed of FEEDS) {

        try {
            const parsed = await parser.parseURL(feed);
            const items = parsed.items.slice(0, 3);

            for (const item of items) {

                if (!item?.link) continue;

                if (seen.has(item.link)) continue;
                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "Untitled";
                const content = item.contentSnippet || "";

                // ================= AI ANALYSIS =================
                const score = getSentimentScore(title, content);
                const sentiment = getSentiment(score);

                const scamScore = getScamScore(
                    title,
                    content,
                    item.link
                );

                const risk = getRiskLevel(scamScore);

                const whaleAlert =
                    title.toLowerCase().includes("whale") ||
                    content.toLowerCase().includes("whale");

                const vip = routeIntelligence({
                    score,
                    sentiment,
                    whaleAlert,
                    risk
                });

                console.log(
                    `🧠 AI → Score:${score} Sentiment:${sentiment} Risk:${risk} Whale:${whaleAlert}`
                );

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(title.substring(0, 256))
                    .setURL(item.link)
                    .setDescription(
                        (content || "No summary available.").substring(0, 500)
                    )
                    .setColor(
                        sentiment.includes("BULLISH")
                            ? 0x00ff88
                            : sentiment.includes("BEARISH")
                            ? 0xff4444
                            : 0x00bfff
                    )
                    .setFooter({
                        text: `${vip.tier} • ${sentiment} • Risk: ${risk}`
                    })
                    .setTimestamp();

                // ================= IMAGE SYSTEM =================
                const image =
                    item.enclosure?.url ||
                    item.thumbnail ||
                    getFallbackImage(title);

                if (image) {
                    embed.setImage(image);
                }

                // ================= ROUTING =================
                const channel = client.channels.cache.find(
                    c => c.name === vip.channel
                );

                if (!channel) {
                    console.log(`⚠️ Channel not found: ${vip.channel}`);
                    continue;
                }

                await channel.send({ embeds: [embed] });

                savePost(item.link, title);

                console.log(
                    `✅ RSS (${vip.tier}) → ${vip.channel}: ${title}`
                );
            }

        } catch (err) {
            console.log(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;