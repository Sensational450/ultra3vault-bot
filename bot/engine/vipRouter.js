function routeIntelligence({
    score,
    sentiment,
    whaleAlert,
    breaking,
    airdrop,
    risk,
    vipAlpha
}) {

    if (risk === "DANGEROUS") {
        return { channel: "security-alerts", tier: "BLOCKED" };
    }

    if (vipAlpha) {
        return { channel: "vip-alpha", tier: "ALPHA" };
    }

    if (whaleAlert) {
        return { channel: "whale-alerts", tier: "VIP" };
    }

    if (breaking && score >= 6) {
        return { channel: "breaking-news", tier: "VIP" };
    }

    if (airdrop) {
        return { channel: "airdrop-alerts", tier: "FREE" };
    }

    if (sentiment === "VERY BULLISH") {
        return { channel: "bullish-signals", tier: "VIP" };
    }

    if (sentiment === "VERY BEARISH") {
        return { channel: "bearish-alerts", tier: "FREE" };
    }

    return { channel: "crypto-news", tier: "FREE" };
}

// ✅ IMPORTANT EXPORT FIX
module.exports = { routeIntelligence };