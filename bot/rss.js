const Parser = require("rss-parser");
const parser = new Parser();

const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/"
];

function detectType(title) {
    const text = title.toLowerCase();

    if (text.includes("airdrop")) return "airdrop";
    if (text.includes("signal")) return "signals";
    return "news";
}

async function fetchRSS() {

    let results = [];

    for (const url of FEEDS) {

        try {
            const feed = await parser.parseURL(url);

            for (const item of feed.items.slice(0, 5)) {

                results.push({
                    title: item.title,
                    link: item.link,
                    type: detectType(item.title)
                });
            }

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }
    }

    return results;
}

module.exports = { fetchRSS };