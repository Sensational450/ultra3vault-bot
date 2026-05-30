const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

// ================= TRACKED COINS =================
const COINS = ["bitcoin", "ethereum", "solana", "bnb", "ripple"];

// ================= MEMORY =================
const lastPrices = {};

// ================= FETCH PRICE =================
async function getPrice(coin) {

    try {
        const res = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`
        );

        return res.data[coin]?.usd || null;

    } catch (err) {
        console.log("PRICE API ERROR:", err.message);
        return null;
    }
}

// ================= ANALYZE MOVE =================
function analyzeChange(oldPrice, newPrice) {

    if (!oldPrice || !newPrice) return null;

    const change = ((newPrice - oldPrice) / oldPrice) * 100;

    return change;
}

// ================= MAIN LOOP =================
async function fetchPrices(client) {

    if (!client) return;

    for (const coin of COINS) {

        const price = await getPrice(coin);
        if (!price) continue;

        const oldPrice = lastPrices[coin];
        const change = analyzeChange(oldPrice, price);

        lastPrices[coin] = price;

        // first run skip
        if (!oldPrice) continue;

        // ================= ALERT RULES =================

        let alertType = null;

        if (change >= 5) alertType = "🚀 PUMP ALERT";
        else if (change <= -5) alertType = "⚠️ DUMP ALERT";

        if (!alertType) continue;

        // ================= FIND CHANNEL =================
        const channel = client.channels.cache.find(
            c => c.name === "price-alerts"
        );

        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`${alertType} - ${coin.toUpperCase()}`)
            .setDescription(
                `💰 Price: $${price}\n📊 Change: ${change.toFixed(2)}%`
            )
            .setColor(change > 0 ? 0x00ff00 : 0xff0000)
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }
}

module.exports = fetchPrices;