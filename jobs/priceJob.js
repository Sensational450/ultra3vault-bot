const fetchPrices = require("../bot/engine/priceEngine");

function startPriceJob(client) {

    fetchPrices(client);

    setInterval(() => {
        fetchPrices(client);
    }, 90 * 1000); // anti-429 protection
}

module.exports = { startPriceJob };