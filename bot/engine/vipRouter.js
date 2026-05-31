function routeIntelligence(data) {
    const { score = 0, sentiment = "NEUTRAL", whaleAlert = false, risk = "SAFE" } = data;

    if (risk === "DANGEROUS") {
        return { channel: "security-alerts", tier: "BLOCKED" };
    }

    if (whaleAlert && score >= 6) {
        return { channel: "whale-alerts", tier: "VIP" };
    }

    if (score >= 8) {
        return { channel: "alpha-news", tier: "ELITE" };
    }

    if (score >= 5) {
        return { channel: "vip-news", tier: "VIP" };
    }

    if (sentiment.includes("BULLISH")) {
        return { channel: "crypto-news", tier: "FREE" };
    }

    if (sentiment.includes("BEARISH")) {
        return { channel: "market-watch", tier: "FREE" };
    }

    return { channel: "crypto-news", tier: "FREE" };
}

module.exports = { routeIntelligence };