function sentimentAPI(text = "") {

    const t = text.toLowerCase();

    let score = 0;

    if (t.includes("bull") || t.includes("pump")) score += 2;
    if (t.includes("bear") || t.includes("dump")) score -= 2;
    if (t.includes("good") || t.includes("up")) score += 1;
    if (t.includes("bad") || t.includes("down")) score -= 1;

    return {
        score,
        sentiment:
            score > 2 ? "positive" :
            score < -2 ? "negative" :
            "neutral",
        source: "sentimentAPI"
    };
}

module.exports = sentimentAPI;