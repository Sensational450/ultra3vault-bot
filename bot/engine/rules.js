// ================= RULE ENGINE =================
// This file controls ALL routing + priority decisions

// 🧠 Determines if content should be treated as VIP-level signal
function isVIPSignal(score, airdrop, breaking) {
    return score >= 7 || airdrop || breaking;
}

// ⚡ Priority system (how important the news is)
function getPriority(score) {
    if (score >= 7) return "VIP";
    if (score >= 5) return "HIGH";
    if (score >= 3) return "NORMAL";
    return "LOW";
}

// 📡 Determines which Discord channel to send message to
function getChannelName(score, airdrop, breaking, category) {
    if (airdrop) return "airdrop-alerts";
    if (breaking || score >= 6) return "breaking-news";
    return category;
}

// 💎 Optional helper: checks if content is high value
function isHighValue(score, airdrop, breaking) {
    return score >= 6 || airdrop || breaking;
}

// ================= EXPORT =================
module.exports = {
    isVIPSignal,
    getPriority,
    getChannelName,
    isHighValue
};
