const axios = require("axios");

let cache = null;
let lastFetch = 0;

const CACHE_TIME = 60 * 1000; // 1 minute

async function getPrices() {
    const now = Date.now();

    if (cache && now - lastFetch < CACHE_TIME) {
        return cache; // return cached data
    }

    try {
        const res = await axios.get(
            "https://api.coingecko.com/api/v3/coins/markets",
            {
                params: {
                    vs_currency: "usd",
                    order: "market_cap_desc",
                    per_page: 50,
                    page: 1,
                    sparkline: false
                }
            }
        );

        cache = res.data;
        lastFetch = now;

        return cache;

    } catch (err) {
        console.log("❌ CoinGecko fetch failed:", err.message);
        return cache || [];
    }
}

module.exports = { getPrices };