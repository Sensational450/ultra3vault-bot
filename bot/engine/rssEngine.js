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

// ================= INTELLIGENCE CLASSIFICATION =================
function getIntelLabel(score, risk, whaleAlert) {
    if (risk === "DANGEROUS") return "🚨 CRITICAL ALERT";
    if (whaleAlert && score >= 5) return "🐋 WHALE INTEL";
    if (score >= 8) return "🔥 BREAKING INTEL";
    if (score >= 5) return "📊 HIGH IMPACT";
    if (score <= -3) return "⚠️ NEGATIVE PRESSURE";
    return "📰 MARKET UPDATE";
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

                const intelLabel = getIntelLabel(score, risk, whaleAlert);

                console.log(
                    `🧠 AI → Score:${score} Sentiment:${sentiment} Risk:${risk} Whale:${whaleAlert}`
                );

                // ================= BLOOMBERG STYLE EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(`ULTRA3 INTEL: ${title.substring(0, 200)}`)
                    .setURL(item.link)
                    .setDescription(
                        `**${intelLabel}**\n\n` +
                        `📌 ${content || "No summary available."}\n\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `📊 SENTIMENT: ${sentiment}\n` +
                        `⚠️ RISK: ${risk}\n` +
                        `📈 SCORE: ${score}\n` +
                        `🐋 WHALE: ${whaleAlert ? "YES" : "NO"}\n` +
                        `━━━━━━━━━━━━━━━━━━`
                    )
                    .setColor(
                        risk === "DANGEROUS"
                            ? 0xff0000
                            : score >= 6
                            ? 0x00ff88
                            : score <= -3
                            ? 0xff4444
                            : 0x00bfff
                    )
                    .setImage(
                        item.enclosure?.url ||
                        item.thumbnail ||
                        getFallbackImage(title)
                    )
                    .setFooter({
                        text: `ULTRA3 INTELLIGENCE • ${vip.channel.toUpperCase()}`
                    })
                    .setTimestamp();

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