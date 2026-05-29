const axios = require("axios");

let lastPrices = {
    bitcoin: null,
    ethereum: null
};

// % threshold for alerts
const THRESHOLD = 2.5;

async function fetchPrices(client) {

    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
        );

        const data = res.data;

        const btc = data.bitcoin.usd;
        const eth = data.ethereum.usd;

        // ================= BTC CHECK =================
        if (lastPrices.bitcoin) {
            const change = ((btc - lastPrices.bitcoin) / lastPrices.bitcoin) * 100;

            if (Math.abs(change) >= THRESHOLD) {
                sendAlert(client, "Bitcoin", btc, change);
            }
        }

        // ================= ETH CHECK =================
        if (lastPrices.ethereum) {
            const change = ((eth - lastPrices.ethereum) / lastPrices.ethereum) * 100;

            if (Math.abs(change) >= THRESHOLD) {
                sendAlert(client, "Ethereum", eth, change);
            }
        }

        lastPrices.bitcoin = btc;
        lastPrices.ethereum = eth;

    } catch (err) {
        console.error("PRICE ALERT ERROR:", err.message);
    }
}

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
                { name: "💰 Price", value: `$${price}`, inline: true },
                { name: "📊 Change", value: `${change.toFixed(2)}%`, inline: true }
            ],
            color: change > 0 ? 0x00ff00 : 0xff0000,
            timestamp: new Date()
        }]
    });

    console.log(`📊 ALERT: ${coin} ${change.toFixed(2)}%`);
}

module.exports = fetchPrices;