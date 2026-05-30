const axios = require("axios");

let cache = null;
let lastFetch = 0;
const CACHE = 120000;

let blockedUntil = 0;

async function fetchPrices(client) {

    if (Date.now() < blockedUntil) return;

    if (cache && Date.now() - lastFetch < CACHE) return;

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
        lastFetch = Date.now();

    } catch (err) {

        if (err.response?.status === 429) {
            blockedUntil = Date.now() + 120000;
            console.log("⚠️ CoinGecko cooldown activated");
        }
    }
}

module.exports = fetchPrices;