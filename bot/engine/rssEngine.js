const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db");

const vipRouter = require("./vipRouter"); // 🔥 IMPORTANT ADD

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
            const items = parsed.items.slice(0, 2);

            for (const item of items) {

                if (!item?.link) continue;

                if (seen.has(item.link)) continue;
                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const title = item.title || "";
                const content = item.contentSnippet || "";

                // ================= VIP ROUTING (NEW SYSTEM) =================
                const vip = vipRouter.routeIntelligence?.({
                    title,
                    content
                }) || {
                    channel: "crypto-news",
                    tier: "FREE"
                };

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                // 🔥 FIXED: dynamic channel routing
                const channel = client.channels.cache.find(
                    c => c.name === vip.channel
                );

                if (!channel) {
                    console.log(`⚠️ Channel not found: ${vip.channel}`);
                    continue;
                }

                await channel.send({ embeds: [embed] });

                savePost(item.link, title);

                console.log(`✅ RSS (${vip.tier}) → ${vip.channel}: ${title}`);
            }

        } catch (err) {
            console.log(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;