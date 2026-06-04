const axios = require("axios");

async function marketAPI() {
    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/coins/markets",
            {
                params: {
                    vs_currency: "usd",
                    order: "market_cap_desc",
                    per_page: 10,
                    page: 1
                }
            }
        );

        return res.data.map(coin => ({
            name: coin.name,
            symbol: coin.symbol,
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            source: "marketAPI"
        }));

    } catch (err) {
        console.log("❌ marketAPI error:", err.message);
        return [];
    }
}

module.exports = marketAPI;