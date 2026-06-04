const axios = require("axios");

async function newsAPI() {
    try {

        const res = await axios.get(
            "https://cryptopanic.com/api/v1/posts/?auth_token=YOUR_KEY&public=true"
        );

        return res.data.results.map(post => ({
            title: post.title,
            url: post.url,
            source: "newsAPI",
            publishedAt: post.published_at
        }));

    } catch (err) {
        console.log("❌ newsAPI error:", err.message);
        return [];
    }
}

module.exports = newsAPI;
