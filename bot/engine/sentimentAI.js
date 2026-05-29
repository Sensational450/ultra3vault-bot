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
    "whale buy"
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
    "scam"
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
    "skyrocket"
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
    "bloodbath"
];

// ================= SENTIMENT SCORE =================
function getSentimentScore(title = "", content = "") {

    const text = (
        title + " " + content
    ).toLowerCase();

    let score = 0;

    bullishWords.forEach(word => {
        if (text.includes(word)) score += 2;
    });

    bearishWords.forEach(word => {
        if (text.includes(word)) score -= 2;
    });

    return score;
}

// ================= MARKET SENTIMENT =================
function getSentiment(score = 0) {

    if (score >= 5) return "VERY BULLISH";
    if (score >= 2) return "BULLISH";
    if (score <= -5) return "VERY BEARISH";
    if (score <= -2) return "BEARISH";

    return "NEUTRAL";
}

// ================= FEAR/GREED INDEX =================
function getFearGreedIndex(score = 0) {

    if (score >= 6) return "EXTREME GREED";
    if (score >= 3) return "GREED";
    if (score <= -6) return "EXTREME FEAR";
    if (score <= -3) return "FEAR";

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

    if (abs >= 8) return "EXTREME";
    if (abs >= 5) return "STRONG";
    if (abs >= 3) return "MEDIUM";

    return "WEAK";
}

// ================= TRADING SIGNAL =================
function getTradingSignal(score = 0) {

    if (score >= 6) return "STRONG BUY";
    if (score >= 3) return "BUY";
    if (score <= -6) return "STRONG SELL";
    if (score <= -3) return "SELL";

    return "HOLD";
}

// ================= AI CONFIDENCE =================
function getConfidenceLevel(score = 0) {

    const confidence = Math.min(
        100,
        Math.abs(score) * 12
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