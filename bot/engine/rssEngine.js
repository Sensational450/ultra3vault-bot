const Parser = require("rss-parser");
const parser = new Parser();

const { EmbedBuilder } = require("discord.js");
const { hasPosted, savePost } = require("../../database/rssDB");

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed"
];

const seen = new Set();
const MAX_SEEN = 300;

function safeAdd(link) {
    if (seen.size > MAX_SEEN) seen.clear();
    seen.add(link);
}

async function fetchRSS(client) {

    for (const feed of FEEDS) {

        try {
            const data = await parser.parseURL(feed);

            for (const item of data.items.slice(0, 2)) {

                if (!item?.link) continue;
                if (seen.has(item.link)) continue;

                safeAdd(item.link);

                if (await hasPosted(item.link)) continue;

                const embed = new EmbedBuilder()
                    .setTitle(item.title || "News")
                    .setURL(item.link)
                    .setDescription((item.contentSnippet || "").slice(0, 180))
                    .setColor(0x00bfff)
                    .setTimestamp();

                const channel = client.channels.cache.find(c => c.name === "crypto-news");
                if (channel) channel.send({ embeds: [embed] });

                await savePost(item.link, item.title);
            }

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }
    }
}

module.exports = fetchRSS;