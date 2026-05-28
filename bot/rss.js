const Parser = require("rss-parser");
const parser = new Parser();

// ================= CRYPTO FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/"
];

// ================= FETCH FUNCTION =================
async function fetchRSS() {

    let results = [];

    for (const url of FEEDS) {

        try {

            const feed = await parser.parseURL(url);

            const items = feed.items.slice(0, 3);

            for (const item of items) {

                results.push({
                    type: "news",
                    title: item.title,
                    content: item.contentSnippet || item.title,
                    link: item.link,
                    created_at: Date.now()
                });
            }

        } catch (err) {
            console.log("RSS ERROR:", url, err.message);
        }
    }

    return results;
}

// ================= EXPORT =================
module.exports = { fetchRSS };