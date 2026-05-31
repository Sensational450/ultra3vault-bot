function routeIntelligence(data) {

    const {
        score = 0,
        sentiment = "NEUTRAL",
        whaleAlert = false,
        risk = "SAFE",
        isAirdrop = false
    } = data;

    // ================= AIRDROP PRIORITY =================
    if (isAirdrop) {
        return {
            channel: "airdrop-news",
            tier: "AIRDROP"
        };
    }

    // ================= SECURITY =================
    if (risk === "DANGEROUS") {
        return { channel: "security-alerts", tier: "BLOCKED" };
    }

    // ================= WHALE =================
    if (whaleAlert && score > 5) {
        return { channel: "whale-alerts", tier: "VIP" };
    }

    // ================= HIGH IMPACT =================
    if (score > 8) {
        return { channel: "alpha-news", tier: "VIP" };
    }

    if (score > 5) {
        return { channel: "vip-news", tier: "VIP" };
    }

    // ================= DEFAULT =================
    return { channel: "crypto-news", tier: "FREE" };
}

module.exports = { routeIntelligence };