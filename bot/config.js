module.exports = {
    prefix: "!",
    rssInterval: 15 * 60 * 1000,
    priceInterval: 2 * 60 * 1000,
    cleanupInterval: 60 * 60 * 1000,

    channels: {
        rss: "crypto-news",
        price: "price-alerts"
    }
};