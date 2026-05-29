// ================= WHALE KEYWORDS =================

const WHALE_KEYWORDS = [
    "moved",
    "transfer",
    "whale",
    "million",
    "billion",
    "binance",
    "coinbase",
    "kraken",
    "exchange",
    "wallet",
    "stablecoin",
    "usdt",
    "usdc",
    "btc",
    "bitcoin",
    "ethereum",
    "eth"
];

// ================= EXCHANGE LIST =================

const EXCHANGES = [
    "binance",
    "coinbase",
    "kraken",
    "okx",
    "bybit",
    "kucoin"
];

// ================= DETECT WHALE =================

function isWhaleAlert(title = "", content = "") {

    const text = (title + " " + content).toLowerCase();

    let score = 0;

    WHALE_KEYWORDS.forEach(word => {
        if (text.includes(word)) {
            score += 1;
        }
    });

    // strong money indicators
    if (
        text.includes("$100m") ||
        text.includes("$500m") ||
        text.includes("1 billion") ||
        text.includes("500 million")
    ) {
        score += 5;
    }

    return score >= 4;
}

// ================= MARKET IMPACT =================

function getMarketImpact(title = "", content = "") {

    const text = (title + " " + content).toLowerCase();

    if (
        text.includes("liquidation") ||
        text.includes("crash") ||
        text.includes("dump")
    ) {
        return "EXTREME";
    }

    if (
        text.includes("binance") ||
        text.includes("coinbase") ||
        text.includes("etf")
    ) {
        return "HIGH";
    }

    return "MEDIUM";
}

// ================= EXCHANGE DETECTOR =================

function detectExchange(title = "", content = "") {

    const text = (title + " " + content).toLowerCase();

    for (const exchange of EXCHANGES) {

        if (text.includes(exchange)) {
            return exchange.toUpperCase();
        }
    }

    return "UNKNOWN";
}

module.exports = {
    isWhaleAlert,
    getMarketImpact,
    detectExchange
};