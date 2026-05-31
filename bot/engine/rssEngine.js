const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const db = require("../../database/db"); // ✅ SINGLE DB ONLY

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
const parser = new Parser();

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

                // ================= EMBED =================
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(item.link)
                    .setDescription((content || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                const channel = client.channels.cache.find(
                    c => c.name === "crypto-news"
                );

                if (!channel) continue;

                await channel.send({ embeds: [embed] });

                savePost(item.link, title);

                console.log(`✅ RSS Posted: ${title}`);
            }

        } catch (err) {
            console.log(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

module.exports = fetchRSS;