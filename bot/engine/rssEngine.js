const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db");

const { getSentimentScore, getSentiment } = require("./sentimentAI");
const { getScamScore, getRiskLevel } = require("./antiScamAI");
const { routeIntelligence } = require("./vipRouter");

const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

// ================= COVERAGE SYSTEM =================
const CHANNEL_POOL = [
    "crypto-news",
    "vip-news",
    "alpha-news",
    "airdrop-news",
    "whale-alerts",
    "security-alerts"
];

const seen = new Set();
const MAX_SEEN = 200;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= IMAGE =================
function getImage(title = "") {
    const t = title.toLowerCase();

    if (t.includes("bitcoin") || t.includes("btc"))
        return "https://cryptologos.cc/logos/bitcoin-btc-logo.png";

    if (t.includes("ethereum") || t.includes("eth"))
        return "https://cryptologos.cc/logos/ethereum-eth-logo.png";

    return "https://cryptologos.cc/logos/bitcoin-btc-logo.png";
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

// ================= MAIN ENGINE =================
async function fetchRSS(client) {
    if (!client) return;

    const activity = new Map();

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

                // ================= AI =================
                const score = getSentimentScore(title, content);
                const sentiment = getSentiment(score);
                const scamScore = getScamScore(title, content, item.link);
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

                // track coverage
                activity.set(vip.channel, (activity.get(vip.channel) || 0) + 1);

                console.log(`🧠 AI → ${score} | ${sentiment} | ${risk} → ${vip.channel}`);

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(`ULTRA3 INTEL: ${title.slice(0, 200)}`)
                    .setURL(item.link)
                    .setDescription(content?.slice(0, 400) || "No summary")
                    .setColor(
                        risk === "DANGEROUS"
                            ? 0xff0000
                            : score >= 5
                            ? 0x00ff88
                            : 0x00bfff
                    )
                    .setImage(getImage(title))
                    .setFooter({ text: `ULTRA3 INTEL • ${vip.tier}` })
                    .setTimestamp();

                // ================= ROUTING FIX =================
                let channel =
                    client.channels.cache.find(c => c.name === vip.channel) ||
                    client.channels.cache.find(c => c.name === "crypto-news");

                if (!channel) {
                    const fallback =
                        CHANNEL_POOL[Math.floor(Math.random() * CHANNEL_POOL.length)];

                    channel = client.channels.cache.find(c => c.name === fallback);

                    console.log(`🔁 FORCED ROUTE → ${fallback}`);
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

    // ================= COVERAGE GUARANTEE =================
    for (const ch of CHANNEL_POOL) {
        if ((activity.get(ch) || 0) === 0) {
            const channel = client.channels.cache.find(c => c.name === ch);

            if (channel) {
                await channel.send("🧠 Coverage system active — keeping feed alive");
            }
        }
    }
}

module.exports = fetchRSS;