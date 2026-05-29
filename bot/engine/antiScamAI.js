// ================= ANTI-SCAM AI 2.0 =================

const SUSPICIOUS_KEYWORDS = [
    "connect wallet",
    "claim now",
    "verify wallet",
    "seed phrase",
    "private key",
    "urgent action",
    "airdrop reward guaranteed",
    "100% free tokens",
    "mint now",
    "sign message"
];

const DANGEROUS_KEYWORDS = [
    "drain wallet",
    "approve unlimited",
    "sweep wallet",
    "steal funds"
];

const BAD_DOMAINS = [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "short.link"
];

// detect suspicious intent
function getScamScore(title = "", content = "", url = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    SUSPICIOUS_KEYWORDS.forEach(word => {
        if (text.includes(word)) score += 2;
    });

    DANGEROUS_KEYWORDS.forEach(word => {
        if (text.includes(word)) score += 5;
    });

    // URL checks
    if (url) {
        const lowerUrl = url.toLowerCase();

        BAD_DOMAINS.forEach(domain => {
            if (lowerUrl.includes(domain)) score += 3;
        });

        // fake crypto lookalikes
        if (
            lowerUrl.includes("binannce") ||
            lowerUrl.includes("coinbse") ||
            lowerUrl.includes("ethreum")
        ) {
            score += 5;
        }
    }

    return score;
}

// classify risk
function getRiskLevel(score) {
    if (score >= 7) return "DANGEROUS";
    if (score >= 3) return "SUSPICIOUS";
    return "SAFE";
}

module.exports = {
    getScamScore,
    getRiskLevel
};