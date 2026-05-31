const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db");

const { getSentimentScore, getSentiment } = require("./sentimentAI");
const { getScamScore, getRiskLevel } = require("./antiScamAI");
const { routeIntelligence } = require("./vipRouter");

// ================= AIRDROP DETECTOR =================
const AIRDROP_KEYWORDS = [
    "airdrop",
    "claim",
    "eligibility",
    "snapshot",
    "retroactive",
    "testnet",
    "points",
    "reward",
    "distribution",
    "checker",
    "whitelist",
    "allocation"
];

function detectAirdrop(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;
    AIRDROP_KEYWORDS.forEach(k => {
        if (text.includes(k)) score += 2;
    });

    return {
        isAirdrop: score >= 4,
        score
    };
}

// ================= RSS =================
const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

// ================= CHANNEL SYSTEM =================
const CHANNEL_POOL = [
    "crypto-news",
    "vip-news",
    "alpha-news",
    "airdrop-news",
    "whale-alerts",
    "security-alerts"
];

// ================= CACHE =================
const seen = new Set();
const MAX_SEEN = 200;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

// ================= IMAGE SYSTEM =================
function getIntelImage(title = "") {
    const t = title.toLowerCase();

    if (t.includes("hack") || t.includes("exploit")) {
        return "https://images.unsplash.com/photo-1550751827-4bd374c3f58b";
    }

    if (t.includes("sec") || t.includes("lawsuit")) {
        return "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40";
    }

    if (t.includes("bitcoin") || t.includes("btc")) {
        return "https://images.unsplash.com/photo-1621761191319-c6fb62004040";
    }

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

                // ================= AIRDROP DETECTION =================
                const airdrop = detectAirdrop(title, content);

                // ================= ROUTING =================
                let vip = routeIntelligence({
                    score,
                    sentiment,
                    whaleAlert,
                    risk
                });

                // 🔥 FORCE AIRDROP ROUTE
                if (airdrop.isAirdrop) {
                    vip = {
                        channel: "airdrop-news",
                        tier: "AIRDROP"
                    };
                }

                activity.set(vip.channel, (activity.get(vip.channel) || 0) + 1);

                console.log(`🧠 INTEL → ${score} | ${sentiment} | ${risk} → ${vip.channel}`);

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(
                        airdrop.isAirdrop
                            ? `🎁 AIRDROP ALERT: ${title.slice(0, 180)}`
                            : `ULTRA3 INTELLIGENCE: ${title.slice(0, 180)}`
                    )
                    .setURL(item.link)
                    .setDescription(
                        `🧠 **INTELLIGENCE REPORT**\n\n` +
                        `📌 ${content?.slice(0, 350) || "No summary"}\n\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `📊 Sentiment: ${sentiment}\n` +
                        `⚠️ Risk: ${risk}\n` +
                        `📈 Score: ${score}\n` +
                        `🎁 Airdrop: ${airdrop.isAirdrop ? "YES" : "NO"}\n` +
                        `━━━━━━━━━━━━━━━━━━`
                    )
                    .setColor(
                        airdrop.isAirdrop
                            ? 0xffd700
                            : risk === "DANGEROUS"
                            ? 0xff0000
                            : score >= 6
                            ? 0x00ff88
                            : 0x0099ff
                    )
                    .setImage(getIntelImage(title))
                    .setFooter({
                        text: `ULTRA3 INTELLIGENCE • ${vip.channel.toUpperCase()}`
                    })
                    .setTimestamp();

                // ================= ROUTING =================
                let channel =
                    client.channels.cache.find(c => c.name === vip.channel) ||
                    client.channels.cache.find(c => c.name === "crypto-news");

                if (!channel) continue;

                await channel.send({ embeds: [embed] });

                savePost(item.link, title);

                console.log(`✅ POSTED → ${channel.name}`);
            }

        } catch (err) {
            console.log(`❌ RSS ERROR:`, err.message);
        }
    }

    // ================= COVERAGE =================
    for (const ch of CHANNEL_POOL) {
        if (!activity.get(ch)) {
            const channel = client.channels.cache.find(c => c.name === ch);
            if (channel) {
                await channel.send("🧠 Feed active — monitoring intelligence streams");
            }
        }
    }
}

module.exports = fetchRSS;