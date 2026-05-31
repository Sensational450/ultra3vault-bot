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

const parser = new Parser();

// ================= FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

// ================= CHANNEL SYSTEM (IMPORTANT FIX) =================
const CHANNEL_POOL = [
    "crypto-news",
    "vip-news",
    "alpha-news",
    "airdrop-news",
    "whale-alerts",
    "security-alerts"
];

// ================= STATE =================
const seen = new Set();
const MAX_SEEN = 300;

// track distribution per run
const distribution = new Map();

// ================= UTIL =================
function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= INTELLIGENCE IMAGE SYSTEM =================
function getImage(title = "") {
    const t = title.toLowerCase();

    if (t.includes("airdrop")) return "https://images.unsplash.com/photo-1622630998477-20aa696ecb05";
    if (t.includes("hack") || t.includes("exploit")) return "https://images.unsplash.com/photo-1550751827-4bd374c3f58b";
    if (t.includes("bitcoin") || t.includes("btc")) return "https://cryptologos.cc/logos/bitcoin-btc-logo.png";
    if (t.includes("ethereum") || t.includes("eth")) return "https://cryptologos.cc/logos/ethereum-eth-logo.png";

    return "https://images.unsplash.com/photo-1551288049-bebda4e38f71";
}

// ================= DB =================
function hasPosted(link) {
    return new Promise(resolve => {
        db.get(
            "SELECT 1 FROM rss_posts WHERE link = ?",
            [link],
            (err, row) => resolve(!!row)
        );
    });
}

function savePost(link, title) {
    db.run(
        "INSERT OR IGNORE INTO rss_posts (link, title) VALUES (?, ?)",
        [link, title]
    );
}

// ================= TOPIC BOOSTER =================
function detectTopic(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    if (text.includes("airdrop")) return "airdrop-news";
    if (text.includes("hack") || text.includes("exploit")) return "security-alerts";
    if (text.includes("whale")) return "whale-alerts";
    if (text.includes("etf") || text.includes("sec")) return "alpha-news";

    return null;
}

// ================= MAIN ENGINE =================
async function fetchRSS(client) {
    if (!client) return;

    distribution.clear();

    for (const feed of FEEDS) {
        try {
            const parsed = await parser.parseURL(feed);
            const items = parsed.items.slice(0, 4);

            for (const item of items) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "Untitled";
                const content = item.contentSnippet || "";

                // ================= AI =================
                const score = getSentimentScore(title, content);
                const sentiment = getSentiment(score);
                const scamScore = getScamScore(title, content, item.link);
                const risk = getRiskLevel(scamScore);

                const whaleAlert =
                    title.toLowerCase().includes("whale") ||
                    content.toLowerCase().includes("whale");

                let vip = routeIntelligence({
                    score,
                    sentiment,
                    whaleAlert,
                    risk
                });

                // ================= FORCE TOPIC OVERRIDE =================
                const forcedChannel = detectTopic(title, content);
                if (forcedChannel) {
                    vip.channel = forcedChannel;
                }

                // ================= COVERAGE TRACKING =================
                distribution.set(
                    vip.channel,
                    (distribution.get(vip.channel) || 0) + 1
                );

                console.log(
                    `🧠 INTEL → ${score} | ${sentiment} | ${risk} → ${vip.channel}`
                );

                // ================= BLOOMBERG STYLE EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(`ULTRA3 INTEL: ${title.slice(0, 180)}`)
                    .setURL(item.link)
                    .setDescription(
                        `🧠 MARKET INTELLIGENCE REPORT\n\n` +
                        `📌 ${content?.slice(0, 300) || "No summary"}\n\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `📊 Sentiment: ${sentiment}\n` +
                        `⚠️ Risk: ${risk}\n` +
                        `📈 Score: ${score}\n` +
                        `🐋 Whale: ${whaleAlert ? "YES" : "NO"}\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `🔔 ULTRA3 INTELLIGENCE NETWORK`
                    )
                    .setColor(
                        risk === "DANGEROUS"
                            ? 0xff0000
                            : score >= 6
                            ? 0x00ff88
                            : score <= -3
                            ? 0xff4444
                            : 0x0099ff
                    )
                    .setImage(getImage(title))
                    .setFooter({
                        text: `ULTRA3 RSS v3.0 • ${vip.channel.toUpperCase()}`
                    })
                    .setTimestamp();

                // ================= ROUTING FIX =================
                let channel =
                    client.channels.cache.find(c => c.name === vip.channel);

                if (!channel) {
                    const fallback =
                        CHANNEL_POOL[Math.floor(Math.random() * CHANNEL_POOL.length)];

                    channel = client.channels.cache.find(c => c.name === fallback);

                    console.log(`🔁 FALLBACK → ${fallback}`);
                }

                if (!channel) continue;

                await channel.send({ embeds: [embed] });

                savePost(item.link, title);

                console.log(`✅ POSTED → ${channel.name}`);
            }

        } catch (err) {
            console.log(`❌ RSS ERROR:`, err.message);
        }
    }

    // ================= COVERAGE FIX =================
    for (const ch of CHANNEL_POOL) {
        if ((distribution.get(ch) || 0) === 0) {
            const channel = client.channels.cache.find(c => c.name === ch);

            if (channel) {
                await channel.send("🧠 ULTRA3 FEED ACTIVE — monitoring market signals");
            }
        }
    }
}

module.exports = fetchRSS;