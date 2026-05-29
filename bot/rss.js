const Parser = require("rss-parser");
const {
    EmbedBuilder
} = require("discord.js");

const parser = new Parser();

// RSS FEEDS
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://blog.binance.com/en/rss",
    "https://www.theblock.co/rss.xml"
];

// Store posted links
const postedLinks = new Set();

// Detect category
function detectType(title) {
    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrops";
    if (text.includes("bitcoin") || text.includes("btc")) return "bitcoin-news";
    if (text.includes("ethereum") || text.includes("eth")) return "altcoin-news";
    if (text.includes("solana")) return "altcoin-news";
    if (text.includes("gaming")) return "play-to-earn";

    return "crypto-news";
}

// Main RSS Function
async function fetchRSS(client) {

    for (const feed of FEEDS) {

        try {

            const parsed = await parser.parseURL(feed);

            for (const item of parsed.items.slice(0, 5)) {

                // Skip duplicates
                if (postedLinks.has(item.link)) continue;

                postedLinks.add(item.link);

                const category = detectType(item.title);

                // Find channel by name
                const channel = client.channels.cache.find(
                    ch => ch.name === category
                );

                if (!channel) continue;

                // Create embed
                const embed = new EmbedBuilder()
                    .setTitle(item.title)
                    .setURL(item.link)
                    .setDescription(
                        item.contentSnippet?.slice(0, 200) + "..."
                        || "New crypto update"
                    )
                    .setColor(0x00BFFF)
                    .setFooter({
                        text: parsed.title
                    })
                    .setTimestamp(new Date(item.pubDate || Date.now()));

                await channel.send({
                    embeds: [embed]
                });

                console.log(`Posted: ${item.title}`);

            }

        } catch (err) {
            console.error(`RSS Error (${feed})`, err);
        }

    }

}

module.exports = fetchRSS;