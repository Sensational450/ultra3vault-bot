function getVIPClass({
    score,
    sentiment,
    whaleAlert,
    risk,
    breaking,
    airdrop
}) {

    let tier = "NOISE";
    let confidence = 50;

    // ================= SECURITY =================
    if (risk === "DANGEROUS") {
        return { tier: "SECURITY_THREAT", confidence: 95 };
    }

    // ================= WHALE =================
    if (whaleAlert) {
        return { tier: "WHALE_MOVE", confidence: 90 };
    }

    // ================= ALPHA =================
    if (score >= 8 && breaking) {
        return { tier: "VIP_ALPHA", confidence: 85 };
    }

    // ================= AIRDROP =================
    if (airdrop) {
        return { tier: "VIP_SIGNAL", confidence: 70 };
    }

    // ================= WATCHLIST =================
    if (score >= 5) {
        return { tier: "WATCHLIST", confidence: 60 };
    }

    return { tier, confidence };
}

module.exports = {
    getVIPClass
};