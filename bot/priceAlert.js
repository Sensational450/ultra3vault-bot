const axios = require("axios");

let cache = null;
let lastFetch = 0;

const CACHE_TIME = 120000; // 2 min
const THRESHOLD = 2.5;

let blockedUntil = 0;

let lastPrices = {
    bitcoin: null,
    ethereum: null
};

async function getPrices() {

    const now = Date.now();

    if (now < blockedUntil) return cache;

    if (cache && now - lastFetch < CACHE_TIME) return cache;

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

        if (err.response?.status === 429) {
            blockedUntil = Date.now() + 120000;
            console.log("⚠️ CoinGecko cooldown (2 min)");
        } else {
            console.log("❌ CoinGecko error:", err.message);
        }

        return cache;
    }
}

async function fetchPrices(client) {

    const data = await getPrices();
    if (!data) return;

    const btc = data.bitcoin?.usd;
    const eth = data.ethereum?.usd;

    if (!btc || !eth) return;

    if (lastPrices.bitcoin) {
        const change = ((btc - lastPrices.bitcoin) / lastPrices.bitcoin) * 100;
        if (Math.abs(change) >= THRESHOLD) sendAlert(client, "Bitcoin", btc, change);
    }

    if (lastPrices.ethereum) {
        const change = ((eth - lastPrices.ethereum) / lastPrices.ethereum) * 100;
        if (Math.abs(change) >= THRESHOLD) sendAlert(client, "Ethereum", eth, change);
    }

    lastPrices.bitcoin = btc;
    lastPrices.ethereum = eth;
}

function sendAlert(client, coin, price, change) {

    const channel = client.channels.cache.find(ch => ch.name === "price-alerts");
    if (!channel) return;

    channel.send({
        embeds: [{
            title: `${change > 0 ? "🚀" : "🔴"} ${coin}`,
            description: `${coin} moved **${change.toFixed(2)}%**`,
            color: change > 0 ? 0x00ff00 : 0xff0000,
            timestamp: new Date()
        }]
    });
}

module.exports = fetchPrices;