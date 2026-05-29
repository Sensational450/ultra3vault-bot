// ================= BULLISH WORDS =================
const bullishWords = [
    "surge",
    "pump",
    "bullish",
    "breakout",
    "adoption",
    "partnership",
    "approval",
    "rally",
    "gain",
    "moon",
    "institutional buying",
    "etf approval",
    "record high"
];

// ================= BEARISH WORDS =================
const bearishWords = [
    "crash",
    "hack",
    "dump",
    "liquidation",
    "exploit",
    "lawsuit",
    "ban",
    "fear",
    "bearish",
    "sell-off",
    "market panic",
    "collapse",
    "investigation"
];

// ================= SENTIMENT SCORE =================
function getSentimentScore(title = "", content = "") {

    const text = (title + " " + content).toLowerCase();

    let score = 0;

    bullishWords.forEach(word => {
        if (text.includes(word)) score += 2;
    });

    bearishWords.forEach(word => {
        if (text.includes(word)) score -= 2;
    });

    return score;
}

// ================= SENTIMENT LABEL =================
function getSentiment(score) {

    if (score >= 3) return "BULLISH";

    if (score <= -3) return "BEARISH";

    return "NEUTRAL";
}

module.exports = {
    getSentimentScore,
    getSentiment
};