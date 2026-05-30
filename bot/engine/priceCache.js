const axios = require("axios");

let cache = null;
let lastFetch = 0;

const CACHE_TIME = 3 * 60 * 1000; // 3 minutes (IMPORTANT)

async function getPrices() {
    const now = Date.now();

    if (cache && now - lastFetch < CACHE_TIME) {
        return cache;
    }

    try {
        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price",
            {
                params: {
                    ids: "bitcoin,ethereum",
                    vs_currencies: "usd"
                },
                headers: {
                    "User-Agent": "Ultra3Vault/1.0"
                },
                timeout: 10000
            }
        );

        cache = res.data;
        lastFetch = now;

        return cache;

    } catch (err) {
        console.log("❌ PRICE API ERROR:", err.message);
        return cache;
    }
}

module.exports = { getPrices };