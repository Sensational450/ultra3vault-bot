function routeIntelligence(data = {}) {

    const {
        score = 0,
        sentiment = "NEUTRAL",
        whaleAlert = false,
        risk = "SAFE"
    } = data;

    if (risk === "DANGEROUS") {
        return {
            channel: "security-alerts",
            tier: "BLOCKED"
        };
    }

    if (whaleAlert) {
        return {
            channel: "whale-alerts",
            tier: "VIP"
        };
    }

    if (score >= 6) {
        return {
            channel: "alpha-news",
            tier: "ELITE"
        };
    }

    if (score >= 3) {
        return {
            channel: "vip-news",
            tier: "VIP"
        };
    }

    if (
        sentiment === "BEARISH" ||
        sentiment === "VERY BEARISH"
    ) {
        return {
            channel: "risk-watch",
            tier: "FREE"
        };
    }

    if (
        sentiment === "BULLISH" ||
        sentiment === "VERY BULLISH"
    ) {
        return {
            channel: "market-watch",
            tier: "FREE"
        };
    }

    return {
        channel: "crypto-news",
        tier: "FREE"
    };
}

module.exports = {
    routeIntelligence
};