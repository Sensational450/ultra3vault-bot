// ================= VIP INTELLIGENCE ROUTER =================

// 🧠 CENTRAL DECISION ENGINE (ALL ROUTING GOES THROUGH HERE)

function routeIntelligence({
    score,
    sentiment,
    whaleAlert,
    breaking,
    airdrop,
    risk,
    vipAlpha
}) {

    // ================= LAYER 1: SECURITY FIRST =================
    if (risk === "DANGEROUS") {
        return {
            channel: "security-alerts",
            tier: "BLOCKED",
            priority: "CRITICAL"
        };
    }

    // ================= LAYER 2: ALPHA SYSTEM =================
    if (vipAlpha) {
        return {
            channel: "vip-alpha",
            tier: "ALPHA",
            priority: "ELITE"
        };
    }

    // ================= LAYER 3: WHALE FLOW =================
    if (whaleAlert) {
        return {
            channel: "whale-alerts",
            tier: "VIP",
            priority: "HIGH"
        };
    }

    // ================= LAYER 4: BREAKING NEWS =================
    if (breaking && score >= 6) {
        return {
            channel: "breaking-news",
            tier: "VIP",
            priority: "HIGH"
        };
    }

    // ================= LAYER 5: AIRDROP =================
    if (airdrop) {
        return {
            channel: "airdrop-alerts",
            tier: "FREE",
            priority: "MEDIUM"
        };
    }

    // ================= LAYER 6: SENTIMENT ROUTING =================
    if (sentiment === "VERY BULLISH") {
        return {
            channel: "bullish-signals",
            tier: "VIP",
            priority: "MEDIUM"
        };
    }

    if (sentiment === "VERY BEARISH") {
        return {
            channel: "bearish-alerts",
            tier: "FREE",
            priority: "MEDIUM"
        };
    }

    // ================= DEFAULT =================
    return {
        channel: "crypto-news",
        tier: "FREE",
        priority: "LOW"
    };
}

module.exports = {
    routeIntelligence
};