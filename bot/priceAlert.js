const axios = require("axios");

// ================= CACHE SYSTEM =================
let cache = null;
let lastFetch = 0;
const CACHE_TIME = 60 * 1000; // 1 minute

// ================= PRICE MEMORY =================
let lastPrices = {
    bitcoin: null,
    ethereum: null
};

// ================= CONFIG =================
const THRESHOLD = 2.5;

// ================= FETCH FROM COINGECKO =================
async function getMarketPrices() {

    const now = Date.now();

    // 🔥 RETURN CACHE (prevents rate limit)
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
        console.log("❌ CoinGecko fetch error:", err.message);

        // fallback to old cache if available
        return cache;
    }
}

// ================= MAIN ENGINE =================
async function fetchPrices(client) {

    const data = await getMarketPrices();

    if (!data) return;

    const btc = data.bitcoin?.usd;
    const eth = data.ethereum?.usd;

    if (!btc || !eth) return;

    // ================= BTC =================
    if (lastPrices.bitcoin) {

        const change =
            ((btc - lastPrices.bitcoin) /
                lastPrices.bitcoin) * 100;

        if (Math.abs(change) >= THRESHOLD) {
            sendAlert(client, "Bitcoin", btc, change);
        }
    }

    // ================= ETH =================
    if (lastPrices.ethereum) {

        const change =
            ((eth - lastPrices.ethereum) /
                lastPrices.ethereum) * 100;

        if (Math.abs(change) >= THRESHOLD) {
            sendAlert(client, "Ethereum", eth, change);
        }
    }

    lastPrices.bitcoin = btc;
    lastPrices.ethereum = eth;
}

// ================= ALERT SYSTEM =================
function sendAlert(client, coin, price, change) {

    const channel = client.channels.cache.find(
        ch => ch.name === "price-alerts"
    );

    if (!channel) return;

    const emoji = change > 0 ? "🚀" : "🔴";

    channel.send({
        embeds: [{
            title: `${emoji} ${coin} Price Alert`,
            description: `${coin} moved **${change.toFixed(2)}%**`,
            fields: [
                {
                    name: "💰 Price",
                    value: `$${price.toLocaleString()}`,
                    inline: true
                },
                {
                    name: "📊 Change",
                    value: `${change.toFixed(2)}%`,
                    inline: true
                }
            ],
            color: change > 0 ? 0x00ff00 : 0xff0000,
            timestamp: new Date()
        }]
    });

    console.log(`📊 ALERT: ${coin} ${change.toFixed(2)}%`);
}

module.exports = fetchPrices;