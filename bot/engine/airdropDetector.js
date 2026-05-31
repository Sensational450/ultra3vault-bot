// bot/engine/airdropDetector.js

const AIRDROP_KEYWORDS = [
    "airdrop",
    "claim",
    "eligibility",
    "snapshot",
    "retroactive",
    "testnet",
    "points",
    "rewards",
    "season",
    "distribution",
    "checker",
    "allocation",
    "whitelist"
];

function detectAirdrop(title = "", content = "") {
    const text = (title + " " + content).toLowerCase();

    let score = 0;

    AIRDROP_KEYWORDS.forEach(word => {
        if (text.includes(word)) score += 2;
    });

    let level = "NONE";

    if (score >= 8) level = "HIGH";
    else if (score >= 4) level = "MEDIUM";
    else if (score >= 2) level = "LOW";

    return {
        isAirdrop: score >= 2,
        score,
        level
    };
}

module.exports = { detectAirdrop };