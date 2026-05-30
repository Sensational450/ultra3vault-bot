const axios = require("axios");

let cache = null;
let lastFetch = 0;
let blockedUntil = 0;

async function fetchPrices(client) {

    const now = Date.now();

    if (now < blockedUntil) return;

    if (cache && now - lastFetch < 120000) return cache;

    try {
        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price",
            {
                params: {
                    ids: "bitcoin,ethereum",
                    vs_currencies: "usd"
                }
            }
        );

        cache = res.data;
        lastFetch = now;

        const channel = client.channels.cache.find(c => c.name === "price-alerts");

        if (channel) {
            channel.send(`📊 BTC: $${cache.bitcoin.usd} | ETH: $${cache.ethereum.usd}`);
        }

    } catch (err) {

        if (err.response?.status === 429) {
            blockedUntil = Date.now() + 120000;
            console.log("⚠️ CoinGecko cooldown activated");
        }
    }
}

module.exports = fetchPrices;