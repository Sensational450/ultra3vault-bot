const axios = require("axios");

async function cryptoAPI() {
    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/search/trending"
        );

        return res.data.coins.map(c => ({
            name: c.item.name,
            symbol: c.item.symbol,
            score: c.item.score,
            price_btc: c.item.price_btc,
            source: "cryptoAPI"
        }));

    } catch (err) {
        console.log("❌ cryptoAPI error:", err.message);
        return [];
    }
}

module.exports = cryptoAPI;