// ================= WHALE TRACKER ENGINE =================

// minimum whale transaction
const MIN_WHALE_USD = 100000;

// known exchanges
const EXCHANGES = [
    "binance",
    "coinbase",
    "kraken",
    "okx",
    "bybit",
    "kucoin"
];

// ================= DETECT WHALE =================
function isWhaleTransaction(amountUSD = 0) {
    return amountUSD >= MIN_WHALE_USD;
}

// ================= CLASSIFY FLOW =================
function classifyWhale(from = "", to = "") {

    const fromText = from.toLowerCase();
    const toText = to.toLowerCase();

    const fromExchange = EXCHANGES.some(ex =>
        fromText.includes(ex)
    );

    const toExchange = EXCHANGES.some(ex =>
        toText.includes(ex)
    );

    // wallet → exchange
    if (!fromExchange && toExchange) {
        return {
            type: "EXCHANGE_INFLOW",
            sentiment: "BEARISH"
        };
    }

    // exchange → wallet
    if (fromExchange && !toExchange) {
        return {
            type: "EXCHANGE_OUTFLOW",
            sentiment: "BULLISH"
        };
    }

    // exchange → exchange
    if (fromExchange && toExchange) {
        return {
            type: "EXCHANGE_TRANSFER",
            sentiment: "NEUTRAL"
        };
    }

    // whale wallet transfer
    return {
        type: "WHALE_TRANSFER",
        sentiment: "UNKNOWN"
    };
}

// ================= WHALE SCORE =================
function getWhaleScore(amountUSD = 0) {

    if (amountUSD >= 10000000) return 10;
    if (amountUSD >= 5000000) return 9;
    if (amountUSD >= 1000000) return 8;
    if (amountUSD >= 500000) return 7;
    if (amountUSD >= 250000) return 6;
    if (amountUSD >= 100000) return 5;

    return 0;
}

// ================= VIP WHALE =================
function isVIPWhale(score = 0) {
    return score >= 8;
}

// ================= EXPORTS =================
module.exports = {
    isWhaleTransaction,
    classifyWhale,
    getWhaleScore,
    isVIPWhale
};