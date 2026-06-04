function riskAPI(text = "") {

    const t = text.toLowerCase();

    let risk = 0;

    if (t.includes("airdrop") && t.includes("free")) risk += 40;
    if (t.includes("wallet") && t.includes("connect")) risk += 30;
    if (t.includes("urgent")) risk += 10;
    if (t.includes("giveaway")) risk += 20;
    if (t.includes("seed phrase")) risk += 60;

    return {
        risk,
        level:
            risk > 60 ? "HIGH" :
            risk > 30 ? "MEDIUM" :
            "LOW",
        source: "riskAPI"
    };
}

module.exports = riskAPI;