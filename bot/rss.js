const Parser = require("rss-parser");
const parser = new Parser();

const db = require("../database/premium");

// ================= RSS FEEDS =================
const FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/"
];

// ================= CATEGORY DETECTOR =================
function detectType(title) {

    const text = title.toLowerCase();

    if (
        text.includes("airdrop") ||
        text.includes("claim") ||
        text.includes("reward")
    ) {
        return "airdrop";
    }

    if (
        text.includes("signal") ||
        text.includes("trade") ||
        text.includes("bitcoin price") ||
        text.includes("btc")
    ) {
        return "signals";
    }

    return "news";
}

// ================= SAVE TO DATABASE =================
function savePost(post) {

    return new Promise((resolve) => {

        // prevent duplicates
        db.get(
            `SELECT * FROM premium_content WHERE title = ?`,
            [post.title],

            (err, row) => {

                if (row) {
                    return resolve(false);
                }

                db.run(
                    `INSERT INTO premium_content
                    (type, title, content, link, created_at)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        post.type,
                        post.title,
                        post.title,
                        post.link,
                        Date.now()
                    ],

                    (err) => {

                        if (err) {
                            console.log("RSS DB ERROR:", err.message);
                            return resolve(false);
                        }

                        console.log("✅ RSS POST SAVED:", post.title);

                        resolve(true);
                    }
                );
            }
        );
    });
}

// ================= FETCH RSS =================
async function fetchRSS() {

    let results = [];

    for (const url of FEEDS) {

        try {

            const feed = await parser.parseURL(url);

            for (const item of feed.items.slice(0, 5)) {

                const post = {
                    title: item.title,
                    link: item.link,
                    type: detectType(item.title)
                };

                results.push(post);

                // auto save to database
                await savePost(post);
            }

        } catch (err) {

            console.log("RSS ERROR:", err.message);
        }
    }

    return results;
}

// ================= AUTO RSS LOOP =================
function startRSSSystem() {

    console.log("🚀 RSS AUTO SYSTEM STARTED");

    // run instantly
    fetchRSS();

    // run every 30 minutes
    setInterval(async () => {

        console.log("🔄 Checking RSS feeds...");

        await fetchRSS();

    }, 30 * 60 * 1000);
}

module.exports = {
    fetchRSS,
    startRSSSystem
};