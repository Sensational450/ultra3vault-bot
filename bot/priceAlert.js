const axios = require("axios");

// ================= CACHE =================
let cache = null;
let lastFetch = 0;
const CACHE_TIME = 120000;

// ================= BACKOFF =================
let blockedUntil = 0;

// ================= PRICE MEMORY =================
let lastPrices = {
    bitcoin: null,
    ethereum: null
};

const THRESHOLD = 2.5;

// ================= FETCH PRICES =================
async function getPrices() {

    const now = Date.now();

    if (now < blockedUntil) return cache;

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

        if (err.response?.status === 429) {
            console.log("⚠️ CoinGecko cooldown (2 min)");
            blockedUntil = Date.now() + 120000;
        } else {
            console.log("❌ CoinGecko error:", err.message);
        }

        return cache;
    }
}

// ================= MAIN ENGINE =================
async function fetchPrices(client) {

    const data = await getPrices();
    if (!data) return;

    const btc = data.bitcoin?.usd;
    const eth = data.ethereum?.usd;

    if (!btc || !eth) return;

    if (lastPrices.bitcoin) {
        const change = ((btc - lastPrices.bitcoin) / lastPrices.bitcoin) * 100;

        if (Math.abs(change) >= THRESHOLD) {
            sendAlert(client, "Bitcoin", btc, change);
        }
    }

    if (lastPrices.ethereum) {
        const change = ((eth - lastPrices.ethereum) / lastPrices.ethereum) * 100;

        if (Math.abs(change) >= THRESHOLD) {
            sendAlert(client, "Ethereum", eth, change);
        }
    }

    lastPrices.bitcoin = btc;
    lastPrices.ethereum = eth;
}

// ================= ALERT =================
function sendAlert(client, coin, price, change) {

    const channel = client.channels.cache.find(ch => ch.name === "price-alerts");
    if (!channel) return;

    channel.send({
        embeds: [{
            title: `${change > 0 ? "🚀" : "🔴"} ${coin} Alert`,
            description: `${coin} moved **${change.toFixed(2)}%**`,
            fields: [
                { name: "Price", value: `$${price}`, inline: true },
                { name: "Change", value: `${change.toFixed(2)}%`, inline: true }
            ],
            color: change > 0 ? 0x00ff00 : 0xff0000,
            timestamp: new Date()
        }]
    });
}

module.exports = fetchPrices;