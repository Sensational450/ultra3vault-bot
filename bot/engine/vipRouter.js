function routeIntelligence(data) {

    const {
        score = 0,
        sentiment = "NEUTRAL",
        whaleAlert = false,
        risk = "SAFE"
    } = data;

    if (risk === "DANGEROUS") {
        return { channel: "security-alerts", tier: "BLOCKED" };
    }

    if (whaleAlert && score > 5) {
        return { channel: "whale-alerts", tier: "VIP" };
    }

    if (score > 8) {
        return { channel: "alpha-news", tier: "VIP" };
    }

    if (sentiment === "BULLISH") {
        return { channel: "crypto-news", tier: "FREE" };
    }

    return { channel: "crypto-news", tier: "FREE" };
}

module.exports = { routeIntelligence };