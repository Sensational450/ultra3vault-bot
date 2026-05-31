// ================= BULLISH KEYWORDS =================
const bullishWords = [
    "pump",
    "surge",
    "bullish",
    "rally",
    "breakout",
    "ath",
    "buy",
    "accumulation",
    "adoption",
    "approval",
    "etf",
    "partnership",
    "moon",
    "whale buy",

    // Crypto-specific
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "solana",
    "xrp",
    "dogecoin",

    // Market signals
    "record high",
    "all-time high",
    "new high",
    "price target",
    "price targets",
    "institutional adoption",
    "institutional investment",
    "inflow",
    "spot etf",
    "launch",
    "growth",
    "expansion",
    "integration",
    "upgrade",
    "staking",
    "approved",
    "green candle",
    "recovery"
];

// ================= BEARISH KEYWORDS =================
const bearishWords = [
    "crash",
    "dump",
    "hack",
    "bearish",
    "selloff",
    "fear",
    "liquidation",
    "exploit",
    "rug",
    "panic",
    "lawsuit",
    "ban",
    "scam",

    // Crypto-specific
    "attack",
    "stolen",
    "fraud",
    "breach",
    "shutdown",
    "bankruptcy",
    "bankrupt",
    "collapse",
    "investigation",
    "charges",
    "arrest",
    "sec sues",
    "warning",
    "risk",
    "vulnerability",
    "flash loan attack",
    "drain",
    "sanction",
    "rejected",
    "sell pressure",
    "outflow",
    "red candle"
];

// ================= FOMO KEYWORDS =================
const fomoWords = [
    "moon",
    "100x",
    "massive gains",
    "parabolic",
    "buy now",
    "exploding",
    "next bitcoin",
    "skyrocket",
    "don't miss",
    "huge opportunity",
    "life changing",
    "massive rally"
];

// ================= PANIC KEYWORDS =================
const panicWords = [
    "panic",
    "crash",
    "selloff",
    "fear",
    "collapse",
    "liquidation",
    "bankrupt",
    "bloodbath",
    "exploit",
    "hack",
    "rug pull"
];

// ================= SENTIMENT SCORE =================
function getSentimentScore(title = "", content = "") {

    const titleText = title.toLowerCase();
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    bullishWords.forEach(word => {
        if (text.includes(word)) score += 2;
        if (titleText.includes(word)) score += 1;
    });

    bearishWords.forEach(word => {
        if (text.includes(word)) score -= 2;
        if (titleText.includes(word)) score -= 1;
    });

    return score;
}

// ================= MARKET SENTIMENT =================
function getSentiment(score = 0) {

    if (score >= 8) return "EXTREMELY BULLISH";
    if (score >= 5) return "VERY BULLISH";
    if (score >= 2) return "BULLISH";

    if (score <= -8) return "EXTREMELY BEARISH";
    if (score <= -5) return "VERY BEARISH";
    if (score <= -2) return "BEARISH";

    return "NEUTRAL";
}

// ================= FEAR/GREED INDEX =================
function getFearGreedIndex(score = 0) {

    if (score >= 8) return "EXTREME GREED";
    if (score >= 4) return "GREED";

    if (score <= -8) return "EXTREME FEAR";
    if (score <= -4) return "FEAR";

    return "NEUTRAL";
}

// ================= FOMO DETECTOR =================
function detectFOMO(title = "", content = "") {

    const text = (
        title + " " + content
    ).toLowerCase();

    return fomoWords.some(word =>
        text.includes(word)
    );
}

// ================= PANIC DETECTOR =================
function detectPanic(title = "", content = "") {

    const text = (
        title + " " + content
    ).toLowerCase();

    return panicWords.some(word =>
        text.includes(word)
    );
}

// ================= TREND STRENGTH =================
function getTrendStrength(score = 0) {

    const abs = Math.abs(score);

    if (abs >= 10) return "EXTREME";
    if (abs >= 6) return "STRONG";
    if (abs >= 3) return "MEDIUM";

    return "WEAK";
}

// ================= TRADING SIGNAL =================
function getTradingSignal(score = 0) {

    if (score >= 8) return "STRONG BUY";
    if (score >= 3) return "BUY";

    if (score <= -8) return "STRONG SELL";
    if (score <= -3) return "SELL";

    return "HOLD";
}

// ================= AI CONFIDENCE =================
function getConfidenceLevel(score = 0) {

    const confidence = Math.min(
        100,
        40 + Math.abs(score) * 8
    );

    return `${confidence}%`;
}

// ================= EXPORTS =================
module.exports = {
    getSentimentScore,
    getSentiment,
    getFearGreedIndex,
    detectFOMO,
    detectPanic,
    getTrendStrength,
    getTradingSignal,
    getConfidenceLevel
};