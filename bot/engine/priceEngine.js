const axios = require("axios");

let cache = null;
let lastFetch = 0;
const CACHE_TIME = 120000;

let cooldownUntil = 0;

async function fetchPrices(client) {

    const now = Date.now();

    // ================= GLOBAL PROTECTION =================
    if (!client) {
        console.log("❌ Price engine: No client");
        return cache;
    }

    if (now < cooldownUntil) {
        console.log("⏳ Price engine cooldown active");
        return cache;
    }

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
                timeout: 10000
            }
        );

        cache = res.data;
        lastFetch = now;

        return cache;

    } catch (err) {

        if (err.response?.status === 429) {
            cooldownUntil = now + 120000;
            console.log("⚠️ CoinGecko rate limit → cooldown 2 min");
        } else {
            console.log("❌ Price API error:", err.message);
        }

        return cache;
    }
}

module.exports = fetchPrices;