// /engine/intelligence/vipCore.js

// ================= VIP INTELLIGENCE CORE =================

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
}

function calculateConfidence({ score, sentiment, whaleAlert, breaking, airdrop }) {
    let confidence = 50;

    // score influence
    confidence += score * 3;

    // sentiment influence
    if (sentiment === "BULLISH") confidence += 15;
    if (sentiment === "BEARISH") confidence -= 10;

    // event boosts
    if (whaleAlert) confidence += 20;
    if (breaking) confidence += 10;
    if (airdrop) confidence += 8;

    return clamp(confidence, 0, 100);
}

function detectTier({ score, confidence, whaleAlert, risk }) {

    // 🚨 highest priority safety override
    if (risk === "DANGEROUS") {
        return "SECURITY_THREAT";
    }

    // 🐋 whale moves = high alpha
    if (whaleAlert && confidence >= 70) {
        return "VIP_ALPHA";
    }

    // 🔥 strong alpha signals
    if (score >= 8 && confidence >= 75) {
        return "VIP_ALPHA";
    }

    // 📊 strong signals
    if (score >= 6 && confidence >= 55) {
        return "VIP_SIGNAL";
    }

    // ⚠️ medium signals
    if (score >= 3) {
        return "WATCHLIST";
    }

    // ❌ noise
    return "NOISE";
}

function getAction({ sentiment, whaleAlert, score }) {

    if (whaleAlert && score >= 7) {
        return "FOLLOW_WHALE";
    }

    if (sentiment === "BULLISH" && score >= 6) {
        return "LONG";
    }

    if (sentiment === "BEARISH" && score >= 6) {
        return "SHORT";
    }

    return "HOLD";
}

// ================= MAIN ENGINE =================

function getVIPClass({
    score = 0,
    sentiment = "NEUTRAL",
    whaleAlert = false,
    risk = "SAFE",
    breaking = false,
    airdrop = false
}) {

    const confidence = calculateConfidence({
        score,
        sentiment,
        whaleAlert,
        breaking,
        airdrop
    });

    const tier = detectTier({
        score,
        confidence,
        whaleAlert,
        risk
    });

    const action = getAction({
        sentiment,
        whaleAlert,
        score
    });

    return {
        tier,
        confidence,
        action,
        score,
        flags: {
            whaleAlert,
            breaking,
            airdrop,
            risk
        }
    };
}

module.exports = {
    getVIPClass
};
