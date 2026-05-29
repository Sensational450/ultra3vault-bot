const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");

const parser = new Parser();

// RSS FEEDS (FIXED)
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://cryptoslate.com/feed/",
    "https://www.theblock.co/rss.xml"
];

// Store posted links (resets on restart)
const postedLinks = new Set();

// Detect category
function detectType(title = "") {
    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrops";
    if (text.includes("bitcoin") || text.includes("btc")) return "bitcoin-news";
    if (text.includes("ethereum") || text.includes("eth")) return "altcoin-news";
    if (text.includes("solana")) return "altcoin-news";
    if (text.includes("gaming") || text.includes("game")) return "play-to-earn";

    return "crypto-news";
}

// Main RSS Function
async function fetchRSS(client) {

    if (!client) {
        console.log("❌ RSS ERROR: client not provided");
        return;
    }

    for (const feed of FEEDS) {

        try {
            const parsed = await parser.parseURL(feed);

            const items = parsed.items || [];

            for (const item of items.slice(0, 5)) {

                if (!item.link) continue;

                // Skip duplicates
                if (postedLinks.has(item.link)) continue;
                postedLinks.add(item.link);

                const category = detectType(item.title || "");

                const channel = client.channels.cache.find(
                    ch => ch.name === category
                );

                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle(item.title || "Crypto Update")
                    .setURL(item.link)
                    .setDescription(
                        (item.contentSnippet || "New crypto update").slice(0, 200)
                    )
                    .setColor(0x00BFFF)
                    .setFooter({ text: parsed.title || "RSS Feed" })
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({ embeds: [embed] });

                console.log(`✅ Posted: ${item.title}`);

            }

        } catch (err) {
            console.error(`❌ RSS Error (${feed}):`, err.message);
        }
    }
}

// EXPORT
module.exports = fetchRSS;