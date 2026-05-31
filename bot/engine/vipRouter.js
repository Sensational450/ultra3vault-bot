function routeIntelligence(data) {

    const {
        score = 0,
        sentiment = "NEUTRAL",
        whaleAlert = false,
        risk = "SAFE"
    } = data;

    // ================= SECURITY LAYER =================
    if (risk === "DANGEROUS") {
        return {
            channel: "security-alerts",
            tier: "BLOCKED"
        };
    }

    // ================= WHALE DETECTION (HIGHEST PRIORITY) =================
    if (whaleAlert) {

        if (score >= 7) {
            return {
                channel: "whale-alerts",
                tier: "VIP"
            };
        }

        return {
            channel: "market-signals",
            tier: "VIP"
        };
    }

    // ================= HIGH VALUE ALPHA =================
    if (score >= 9) {
        return {
            channel: "alpha-news",
            tier: "ELITE"
        };
    }

    // ================= VIP CONTENT =================
    if (score >= 6) {
        return {
            channel: "vip-news",
            tier: "VIP"
        };
    }

    // ================= SENTIMENT BOOST =================
    if (sentiment === "BULLISH") {

        if (score >= 4) {
            return {
                channel: "crypto-news",
                tier: "FREE"
            };
        }

        return {
            channel: "market-watch",
            tier: "FREE"
        };
    }

    if (sentiment === "BEARISH") {
        return {
            channel: "risk-watch",
            tier: "FREE"
        };
    }

    // ================= DEFAULT =================
    return {
        channel: "crypto-news",
        tier: "FREE"
    };
}

module.exports = { routeIntelligence };